// ==================== 数据导入导出模块 ====================

/**
 * 依赖项（需要在使用前通过 initImportExportModule 设置）
 */
const _dependencies = {
  getTableConfigs: null,
  getCurrentTable: null,
  homeFetch: null,
  showToast: null,
  loadTableData: null
};

/**
 * 初始化导入导出模块
 * @param {Object} dependencies - 依赖项对象
 */
export function initImportExportModule(dependencies) {
  Object.assign(_dependencies, dependencies);
}

/**
 * 导出当前表数据
 */
export async function exportTableData() {
  const tableConfigs = _dependencies.getTableConfigs();
  const currentTable = _dependencies.getCurrentTable();
  const config = tableConfigs[currentTable];
  
  try {
    _dependencies.showToast('正在导出...', 'info');
    
    // 获取数据（主表+详情表）
    const res = await _dependencies.homeFetch(`/api/admin/export/${currentTable}`);
    if (res.code !== 0) throw new Error(res.message);
    
    // 创建工作簿
    const wb = XLSX.utils.book_new();
    
    // 主表数据
    const mainData = res.data.main || res.data;
    const mainWs = createSheetFromData(mainData, config.columns, currentTable);
    XLSX.utils.book_append_sheet(wb, mainWs, currentTable);
    
    // 如果有详情表，添加第二个sheet
    if (config.hasDetail && config.detailTable && res.data.detail) {
      const detailConfig = tableConfigs[config.detailTable];
      if (detailConfig) {
        const detailWs = createSheetFromData(res.data.detail, detailConfig.columns, config.detailTable);
        XLSX.utils.book_append_sheet(wb, detailWs, config.detailTable);
      }
    }
    
    // 下载文件
    const filename = `${config.displayName}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, filename);
    
    _dependencies.showToast('导出成功', 'success');
  } catch (err) {
    _dependencies.showToast('导出失败: ' + err.message, 'error');
  }
}

/**
 * 根据数据和列配置创建Sheet
 * @param {Array} data - 数据数组
 * @param {Array} columns - 列配置数组
 * @param {string} sheetName - Sheet名称
 * @returns {Object} Sheet对象
 */
function createSheetFromData(data, columns, sheetName) {
  // 表头行：使用数据列名
  const headers = columns.map(col => col.key);
  
  // 数据行
  const rows = data.map(row => {
    return columns.map(col => {
      const value = row[col.key];
      if (value === null || value === undefined) return '';
      // 日期时间格式处理
      if (col.type === 'datetime' && value) {
        return new Date(value).toLocaleString('zh-CN');
      }
      if (col.type === 'date' && value) {
        return new Date(value).toLocaleDateString('zh-CN');
      }
      return value;
    });
  });
  
  // 合并表头和数据
  const sheetData = [headers, ...rows];
  return XLSX.utils.aoa_to_sheet(sheetData);
}

/**
 * 处理导入文件选择
 * @param {Event} e - 文件选择事件
 */
export async function handleImportFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  
  try {
    _dependencies.showToast('正在导入...', 'info');
    
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    
    const importResults = {};
    
    // 遍历所有Sheet
    for (const sheetName of workbook.SheetNames) {
      // 按Sheet名匹配数据表配置
      const tableConfigs = _dependencies.getTableConfigs();
      const tableConfig = tableConfigs[sheetName];
      if (!tableConfig) {
        console.log(`跳过未知Sheet: ${sheetName}`);
        continue;
      }
      
      const sheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
      
      if (data.length < 2) {
        importResults[sheetName] = { success: 0, failed: 0, errors: ['无数据'] };
        continue;
      }
      
      const headers = data[0]; // 列名行
      const validKeys = tableConfig.columns.map(c => c.key);
      
      // 构建批量导入数据
      const records = [];
      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        if (!row || row.every(cell => cell === '' || cell === null || cell === undefined)) {
          continue; // 跳过空行
        }
        
        const record = {};
        
        // 按列名匹配，只保留能匹配的列
        headers.forEach((header, index) => {
          if (validKeys.includes(header) && row[index] !== undefined && row[index] !== '') {
            record[header] = row[index];
          }
        });
        
        records.push(record);
      }
      
      // 调用专门的导入API
      if (records.length > 0) {
        try {
          const res = await _dependencies.homeFetch(`/api/admin/import/${sheetName}`, {
            method: 'POST',
            body: JSON.stringify({ records })
          });
          if (res.code !== 0) {
            throw new Error(res.message);
          }
          importResults[sheetName] = {
            success: res.data.success,
            failed: res.data.failed,
            errors: res.data.errors ? res.data.errors.map(e => `第${e.row}行: ${e.error}`) : []
          };
        } catch (err) {
          importResults[sheetName] = { success: 0, failed: records.length, errors: [err.message] };
        }
      }
    }
    
    // 显示导入结果
    showImportResult(importResults);
    
    // 如果导入的是药材信息，清除药材信息缓存
    if (Object.keys(importResults).includes('herbs')) {
      if (typeof window !== 'undefined' && window._stockModule) {
        window._stockModule.clearHerbInfoCache();
      }
    }
    
    // 刷新表格数据
    await _dependencies.loadTableData();
    
  } catch (err) {
    _dependencies.showToast('导入失败: ' + err.message, 'error');
  }
  
  // 清空文件选择，允许重复选择同一文件
  e.target.value = '';
}

/**
 * 显示导入结果
 * @param {Object} results - 导入结果对象
 */
function showImportResult(results) {
  const tableNames = Object.keys(results);
  if (tableNames.length === 0) {
    _dependencies.showToast('没有可导入的数据', 'warning');
    return;
  }
  
  const tableConfigs = _dependencies.getTableConfigs();
  let message = '';
  
  tableNames.forEach(name => {
    const r = results[name];
    const config = tableConfigs[name];
    const displayName = config ? config.displayName : name;
    message += `【${displayName}】成功: ${r.success}条, 失败: ${r.failed}条\n`;
    if (r.errors.length > 0 && r.errors.length <= 5) {
      message += r.errors.map(e => `  ${e}`).join('\n') + '\n';
    } else if (r.errors.length > 5) {
      message += r.errors.slice(0, 5).map(e => `  ${e}`).join('\n') + '\n  ... 还有' + (r.errors.length - 5) + '条错误\n';
    }
  });
  
  alert(message);
}

/**
 * 导出订单明细
 * @param {string} orderId - 订单ID
 */
export async function exportOrderDetail(orderId) {
  const currentTable = _dependencies.getCurrentTable();
  const tableConfigs = _dependencies.getTableConfigs();
  const config = tableConfigs[currentTable];

  if (!config) {
    _dependencies.showToast('无法获取表格配置', 'error');
    return;
  }

  try {
    _dependencies.showToast('正在导出...', 'info');

    // 获取订单详情
    const apiPath = currentTable === 'stock_in_orders'
      ? `/api/stock/in/orders/${orderId}`
      : `/api/stock/out/orders/${orderId}`;
    const res = await _dependencies.homeFetch(apiPath);
    if (res.code !== 0) throw new Error(res.message);

    const order = res.data;
    const items = order.items || [];

    // 创建工作簿
    const wb = XLSX.utils.book_new();

    // Sheet1: 订单信息
    const orderInfo = [
      ['订单信息'],
      ['订单ID', order.id],
      ['供应商/处方ID', order.supplierName || order.prescriptionId || ''],
      ['下单日期', order.purchaseDate || ''],
      ['入库日期/处方时间', order.orderDate || order.prescriptionTime || ''],
      ['总价', order.totalPrice || 0],
      ['状态', order.status === 'draft' ? '草稿' : order.status === 'stocked' ? '已入库' : order.status === 'pending' ? '待执药' : order.status === 'settled' ? '已结算' : order.status]
    ];
    const orderWs = XLSX.utils.aoa_to_sheet(orderInfo);
    XLSX.utils.book_append_sheet(wb, orderWs, '订单信息');

    // Sheet2: 明细数据
    const detailConfig = tableConfigs[config.detailTable];
    const detailColumns = detailConfig ? detailConfig.columns : [];
    const headers = detailColumns.map(col => col.label);
    const rows = items.map(item =>
      detailColumns.map(col => {
        const value = item[col.key];
        return value === null || value === undefined ? '' : value;
      })
    );
    const detailWs = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    XLSX.utils.book_append_sheet(wb, detailWs, '明细');

    // 下载文件
    const orderType = currentTable === 'stock_in_orders' ? '入库单明细' : '执药单明细';
    const filename = `${orderType}_${orderId}.xlsx`;
    XLSX.writeFile(wb, filename);

    _dependencies.showToast('导出成功', 'success');
  } catch (err) {
    _dependencies.showToast('导出失败: ' + err.message, 'error');
  }
}

// ==================== 导出模块实例供全局访问 ====================
if (typeof window !== 'undefined') {
  window._importExportModule = {
    initImportExportModule,
    exportTableData,
    handleImportFile,
    exportOrderDetail
  };
}