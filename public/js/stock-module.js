/**
 * Stock Module - 库存管理模块
 * 
 * 功能：
 * - 入库单管理（确认入库、退回草稿）
 * - 执药单管理（结算、撤销）
 * - 明细管理（保存、删除）
 * - 成本价计算
 * - 订单总价计算
 * - 药材信息缓存
 */

// ==================== 依赖注入 ====================
// 以下依赖函数需要在初始化时注入
let _dependencies = {
  homeFetch: null,           // API 请求函数
  showToast: null,           // 显示提示消息
  showConfirm: null,         // 显示确认对话框
  showAlert: null,           // 显示警告对话框
  escapeHtml: null,          // HTML 转义
  loadTableData: null,       // 重新加载表格数据
  loadStats: null,           // 重新加载统计信息
  getTableData: () => [],    // 获取表格数据
  getCurrentTable: () => '', // 获取当前表名
  getExpandedRows: () => new Set(), // 获取展开的行
  getTableConfig: () => null, // 获取表格配置
  showImagePreview: null,    // 显示图片预览
  getEditingRowId: () => null, // 获取当前编辑行ID
  setEditingRowId: null,     // 设置当前编辑行ID
  clearSelectedIds: null     // 清除选中的ID列表
};

/**
 * 初始化依赖
 * @param {Object} dependencies - 依赖函数对象
 */
export function initStockModule(dependencies) {
  _dependencies = { ..._dependencies, ...dependencies };
  console.log('[StockModule] 已初始化依赖');
}

// ==================== 药材信息缓存 ====================
let herbInfoCache = null;
let _herbInfoMap = null; // 导出给外部使用

/**
 * 获取药材信息映射表
 * @param {boolean} forceRefresh - 是否强制刷新缓存
 * @returns {Promise<Object>} 药材信息映射表 {herbName: {salePrice, cabinetNo, costPrice, stock}}
 */
export async function getHerbInfoMap(forceRefresh = false) {
  if (!forceRefresh && herbInfoCache && Object.keys(herbInfoCache).length > 0) {
    return herbInfoCache;
  }

  try {
    // 获取所有药材，不分页
    const res = await _dependencies.homeFetch('/api/stock/herbs?pageSize=1000');
    // API 返回格式: { code: 0, data: { rows: [...], pagination: {...} } }
    const herbsData = res.data?.rows || res.data || [];
    console.log('[StockModule] 获取药材信息, count:', herbsData.length);
    if (res.code === 0 && Array.isArray(herbsData)) {
      herbInfoCache = {};
      herbsData.forEach(herb => {
        herbInfoCache[herb.name] = {
          salePrice: herb.salePrice || 0,
          cabinetNo: herb.cabinetNo || '',
          costPrice: herb.costPrice || 0,
          stock: herb.stock || 0,
          unit: herb.unit || '克',
          minStock: herb.minStock || 0
        };
      });
      // 同步到全局变量，供其他地方使用
      if (typeof window !== 'undefined') {
        window._herbInfoMap = herbInfoCache;
      }
      _herbInfoMap = herbInfoCache;
      console.log('[StockModule] 药材信息缓存已更新, count:', Object.keys(herbInfoCache).length);
    }
  } catch (err) {
    console.error('[StockModule] 获取药材信息失败:', err);
  }

  return herbInfoCache || {};
}

/**
 * 清空药材信息缓存
 */
export function clearHerbInfoCache() {
  herbInfoCache = null;
  _herbInfoMap = null;
  if (typeof window !== 'undefined') {
    window._herbInfoMap = null;
  }
}

// ==================== 入库单操作 ====================

/**
 * 确认入库
 * @param {number|string} rowId - 入库单ID
 */
export async function confirmStockIn(rowId) {
  _dependencies.showConfirm('确认入库', '确认入库后，库存将自动增加，成本价将自动更新。确定要入库吗？', async () => {
    try {
      const orderId = rowId;

      // 1. 先保存所有编辑中的明细（新增行 + 编辑行）
      // 查找新增行（有数据的新增行）
      const newRow = document.querySelector(`tr.detail-new-row[data-order-id="${orderId}"]`);
      if (newRow) {
        const inputs = newRow.querySelectorAll('.detail-input');
        const hasData = Array.from(inputs).some(input => input.value.trim() !== '');
        if (hasData) {
          await saveDetailNewAuto(newRow);
        }
      }

      // 查找所有编辑行（已有明细的行）
      const detailRows = document.querySelectorAll(`tr[data-order-id="${orderId}"]:not(.detail-new-row)`);
      for (const row of detailRows) {
        await saveDetailEdit(row.dataset.detailId, orderId, row);
      }

      // 2. 再执行入库操作
      const res = await _dependencies.homeFetch(`/api/stock/in/orders/${rowId}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status: 'stocked' })
      });
      if (res.code !== 0) throw new Error(res.message);
      _dependencies.showToast('入库成功', 'success');

      // 清除药材信息缓存，确保现成本提示显示最新数据
      clearHerbInfoCache();

      _dependencies.loadTableData();
      _dependencies.loadStats();
    } catch (err) {
      _dependencies.showToast('入库失败: ' + err.message, 'error');
    }
  });
}

/**
 * 退回草稿
 * @param {number|string} rowId - 入库单ID
 */
export async function revertToDraft(rowId) {
  _dependencies.showConfirm('退回草稿', '退回草稿后，库存将自动恢复。确定要退回吗？', async () => {
    try {
      const res = await _dependencies.homeFetch(`/api/stock/in/orders/${rowId}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status: 'draft' })
      });
      if (res.code !== 0) throw new Error(res.message);
      _dependencies.showToast('已退回草稿', 'success');
      
      // 清除药材信息缓存，确保现成本提示显示最新数据
      clearHerbInfoCache();
      
      _dependencies.loadTableData();
      _dependencies.loadStats();
    } catch (err) {
      _dependencies.showToast('退回失败: ' + err.message, 'error');
    }
  });
}

// ==================== 执药单操作 ====================

/**
 * 结算执药单
 * @param {number|string} orderId - 执药单ID
 */
export async function settleOutOrder(orderId) {
  _dependencies.showConfirm('确认结算', '确认结算后，对应处方将变为"已结算"状态，且库存将自动扣减。确定要结算吗？', async () => {
    try {
      const res = await _dependencies.homeFetch(`/api/stock/out/orders/${orderId}/settle`, {
        method: 'POST'
      });
      if (res.code !== 0) {
        // 库存不足等错误信息弹窗显示
        _dependencies.showAlert('结算失败', res.message);
        return;
      }
      _dependencies.showToast('结算成功', 'success');
      _dependencies.loadTableData();
      _dependencies.loadStats();
    } catch (err) {
      _dependencies.showAlert('结算失败', err.message);
    }
  });
}

/**
 * 撤销已结算的执药单
 * @param {number|string} orderId - 执药单ID
 */
export async function revokeSettledOrder(orderId) {
  _dependencies.showConfirm('确认撤销', '撤销后，执药单将恢复为"待执药"状态，库存将自动恢复，对应处方变为"已审核"。确定要撤销吗？', async () => {
    try {
      const res = await _dependencies.homeFetch(`/api/stock/out/orders/${orderId}/revoke`, {
        method: 'POST'
      });
      if (res.code !== 0) throw new Error(res.message);
      _dependencies.showToast('撤销成功', 'success');
      _dependencies.loadTableData();
      _dependencies.loadStats();
    } catch (err) {
      _dependencies.showToast('撤销失败: ' + err.message, 'error');
    }
  });
}

// ==================== 明细管理 ====================

/**
 * 保存新增明细
 * @param {HTMLElement} row - 新增行元素
 */
export async function saveDetailNewAuto(row) {
  const orderId = row.dataset.orderId;
  const inputs = row.querySelectorAll('.detail-input');
  const newItem = { orderId };

  inputs.forEach(input => {
    const col = input.dataset.col;
    newItem[col] = input.type === 'number' ? parseFloat(input.value) || 0 : input.value;
  });

  if (!newItem.herbName && !newItem.name) {
    _dependencies.showToast('请输入药材名称', 'error');
    return;
  }

  // 检查是否是入库单且是草稿状态
  const tableData = _dependencies.getTableData();
  const order = tableData.find(r => String(r.id) === String(orderId));
  const currentTable = _dependencies.getCurrentTable();
  if (currentTable === 'stock_in_orders' && order && order.status !== 'draft') {
    _dependencies.showToast('已入库的单据不能添加明细', 'error');
    return;
  }

  // 收集所有现有明细
  const detailRows = document.querySelectorAll(`tr[data-order-id="${orderId}"]`);
  const items = [];
  
  // 过滤出明细数据行（不是新增行）
  let effectiveDetailRows = Array.from(detailRows).filter(row => !row.classList.contains('detail-new-row'));
  
  effectiveDetailRows.forEach((row, index) => {
    const inputs = row.querySelectorAll('.detail-input');
    const item = {};
    
    inputs.forEach(input => {
      const col = input.dataset.col;
      item[col] = input.type === 'number' ? parseFloat(input.value) || 0 : input.value;
    });
    
    if (item.herbName || item.name) {
      items.push(item);
    }
  });
  
  // 添加新明细
  items.push(newItem);

  // 保存到后端
  try {
    const apiPath = currentTable === 'stock_in_orders' ? `/api/stock/in/orders/${orderId}` : `/api/stock/out/orders/${orderId}`;
    const res = await _dependencies.homeFetch(apiPath, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items })
    });
    
    if (res.code !== 0) throw new Error(res.message);
    _dependencies.showToast('添加成功', 'success');
    
    // 重新加载表格数据，保持展开状态
    _dependencies.loadTableData();
  } catch (err) {
    _dependencies.showToast('添加失败: ' + err.message, 'error');
  }
}

/**
 * 保存编辑明细
 * @param {string} detailId - 明细ID
 * @param {string} orderId - 订单ID
 * @param {HTMLElement} row - 明细行元素
 */
export async function saveDetailEdit(detailId, orderId, row) {
  // 收集当前编辑的明细数据
  const inputs = row.querySelectorAll('.detail-input');
  const editedItem = {};
  
  inputs.forEach(input => {
    const col = input.dataset.col;
    editedItem[col] = input.type === 'number' ? parseFloat(input.value) || 0 : input.value;
  });
  
  // 收集所有明细（包括当前编辑的行）
  const detailRows = document.querySelectorAll(`tr[data-order-id="${orderId}"]`);
  const items = [];
  
  // 过滤出明细数据行（不是新增行）
  let effectiveDetailRows = Array.from(detailRows).filter(row => !row.classList.contains('detail-new-row'));
  
  effectiveDetailRows.forEach(row => {
    const inputs = row.querySelectorAll('.detail-input');
    const item = {};
    
    inputs.forEach(input => {
      const col = input.dataset.col;
      item[col] = input.type === 'number' ? parseFloat(input.value) || 0 : input.value;
    });
    
    if (item.herbName || item.name) {
      items.push(item);
    }
  });
  
  // 保存到后端
  try {
    const currentTable = _dependencies.getCurrentTable();
    const apiPath = currentTable === 'stock_in_orders' ? `/api/stock/in/orders/${orderId}` : `/api/stock/out/orders/${orderId}`;
    const res = await _dependencies.homeFetch(apiPath, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items })
    });
    
    if (res.code !== 0) throw new Error(res.message);
    _dependencies.showToast('保存成功', 'success');
    
    // 重新加载表格数据，保持展开状态
    _dependencies.loadTableData();
  } catch (err) {
    _dependencies.showToast('保存失败: ' + err.message, 'error');
  }
}

/**
 * 删除明细行
 * @param {string} detailId - 明细ID
 * @param {string} orderId - 订单ID
 */
export async function removeDetailRow(detailId, orderId) {
  // 删除明细数据行
  const row = document.querySelector(`tr[data-detail-id="${detailId}"]`);
  if (row) {
    row.remove();
  }
  
  // 收集剩余明细并保存到后端
  const detailRows = document.querySelectorAll(`tr[data-order-id="${orderId}"]`);
  const items = [];
  
  // 过滤出明细数据行（不是新增行）
  let effectiveDetailRows = Array.from(detailRows).filter(row => !row.classList.contains('detail-new-row'));
  
  effectiveDetailRows.forEach(row => {
    const inputs = row.querySelectorAll('.detail-input');
    const item = {};
    
    inputs.forEach(input => {
      const col = input.dataset.col;
      item[col] = input.type === 'number' ? parseFloat(input.value) || 0 : input.value;
    });
    
    if (item.herbName || item.name) {
      items.push(item);
    }
  });
  
  // 保存到后端
  try {
    const currentTable = _dependencies.getCurrentTable();
    const apiPath = currentTable === 'stock_in_orders' ? `/api/stock/in/orders/${orderId}` : `/api/stock/out/orders/${orderId}`;
    const res = await _dependencies.homeFetch(apiPath, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items })
    });
    
    if (res.code !== 0) throw new Error(res.message);
    _dependencies.showToast('删除成功', 'success');
    
    // 重新加载表格数据，保持展开状态
    _dependencies.loadTableData();
  } catch (err) {
    _dependencies.showToast('删除失败: ' + err.message, 'error');
  }
}

// ==================== 计算功能 ====================

/**
 * 计算入库单总金额（所有明细的 克数*进货单价/1000 之和，单价为公斤价）
 * @param {string} orderId - 订单ID
 */
export function calculateOrderTotalAmount(orderId) {
  const currentTable = _dependencies.getCurrentTable();

  if (currentTable !== 'stock_in_orders') return;

  const detailRows = document.querySelectorAll(`tr[data-order-id="${orderId}"]`);
  const newRows = document.querySelectorAll(`tr.detail-new-row[data-order-id="${orderId}"]`);

  let totalAmount = 0;

  // 遍历现有明细行（单价为公斤价，数量为克数，需除以1000）
  detailRows.forEach(row => {
    const quantityInput = row.querySelector('.detail-input[data-col="quantity"]');
    const unitPriceInput = row.querySelector('.detail-input[data-col="unitPrice"]');

    if (quantityInput && unitPriceInput) {
      const quantity = parseFloat(quantityInput.value) || 0;
      const unitPrice = parseFloat(unitPriceInput.value) || 0;
      totalAmount += quantity * unitPrice / 1000;
    }
  });

  // 遍历新增行
  newRows.forEach(row => {
    const quantityInput = row.querySelector('.detail-input[data-col="quantity"]');
    const unitPriceInput = row.querySelector('.detail-input[data-col="unitPrice"]');

    if (quantityInput && unitPriceInput) {
      const quantity = parseFloat(quantityInput.value) || 0;
      const unitPrice = parseFloat(unitPriceInput.value) || 0;
      totalAmount += quantity * unitPrice / 1000;
    }
  });

  // 更新订单行的总金额
  const orderRow = document.querySelector(`tr[data-id="${orderId}"]`);

  if (orderRow) {
    // 总金额字段是只读的，在 td 元素上查找
    const totalAmountCell = orderRow.querySelector(`td[data-col-key="totalAmount"] span.cell-readonly`);

    if (totalAmountCell) {
      totalAmountCell.textContent = totalAmount.toFixed(2);
    }
  }
}

/**
 * 计算明细总价（仅执药单）
 * @param {HTMLElement} row - 明细行元素
 */
export async function calculateDetailTotalPrice(row) {
  const quantityInput = row.querySelector('.detail-input[data-col="quantity"]');
  const unitPriceInput = row.querySelector('.detail-input[data-col="unitPrice"]');
  const herbNameInput = row.querySelector('.detail-input[data-col="herbName"]');
  const totalPriceInput = row.querySelector('.detail-input[data-col="totalPrice"]');
  const cabinetNoInput = row.querySelector('.detail-input[data-col="cabinetNo"]');

  const currentTable = _dependencies.getCurrentTable();

  // 执药单：根据药材名称自动获取单价和柜号
  if (currentTable === 'stock_out_orders' && herbNameInput) {
    const herbName = herbNameInput.value.trim();

    if (herbName) {
      const infoMap = await getHerbInfoMap();

      if (infoMap[herbName]) {
        const herbInfo = infoMap[herbName];

        if (unitPriceInput) {
          unitPriceInput.value = herbInfo.salePrice;
          unitPriceInput.dataset.autoFilled = 'true';
        }

        if (cabinetNoInput) {
          cabinetNoInput.value = herbInfo.cabinetNo || '';
        }
      }
    }
  }

  // 入库单不需要计算单个明细的总价（totalPrice列已隐藏）
  if (currentTable === 'stock_in_orders') {
    return;
  }

  // 执药单需要计算明细总价
  if (!quantityInput || !unitPriceInput || !totalPriceInput) {
    return;
  }

  const quantity = parseFloat(quantityInput.value) || 0;
  const unitPrice = parseFloat(unitPriceInput.value) || 0;
  // 单价为公斤价，数量为克数，总价需除以1000
  const calculatedTotal = (quantity * unitPrice / 1000).toFixed(2);

  // 自动更新总价
  totalPriceInput.value = calculatedTotal;
  totalPriceInput.dataset.autoCalc = 'true';

  // 执药单：自动保存到后端
  if (currentTable === 'stock_out_orders') {
    const orderId = row.dataset.orderId;
    const isNew = row.dataset.isNew === 'true';

    // 如果不是新增行，自动保存当前编辑的明细
    if (!isNew && orderId) {
      try {
        await saveDetailEdit(row.dataset.detailId, orderId, row);
      } catch (err) {
        console.error('自动保存明细失败:', err);
      }
    }
  }
}

/**
 * 处理药材名称输入事件
 * @param {Event} e - 输入事件
 */
export async function handleHerbNameInput(e) {
  // 入库明细：输入药材名称后更新成本价提示，并自动计算成本价
  const currentTable = _dependencies.getCurrentTable();
  if (currentTable !== 'stock_in_orders') return;

  const input = e.target;
  const tr = input.closest('tr');
  if (!tr) return;

  const herbName = input.value.trim();
  const costPriceInput = tr.querySelector('input[data-col="costPrice"]');
  const hintSpan = costPriceInput ? costPriceInput.parentElement.querySelector('.field-hint') : null;
  const quantityInput = tr.querySelector('input[data-col="quantity"]');
  const unitPriceInput = tr.querySelector('input[data-col="unitPrice"]');

  // 获取药材信息（新药材默认库存和成本为 0）
  const herbInfo = herbName && window._herbInfoMap && window._herbInfoMap[herbName];
  const currentStock = herbInfo ? (parseFloat(herbInfo.stock) || 0) : 0;
  const currentCost = herbInfo ? (parseFloat(herbInfo.costPrice) || 0) : 0;

  // 更新提示
  if (hintSpan) {
    hintSpan.textContent = herbInfo ? `(现成本:${currentCost.toFixed(2)})` : (herbName ? '(新药材)' : '');
  }

  // 如果克数和进货价已填写，自动计算成本价
  if (herbName && quantityInput && unitPriceInput && costPriceInput) {
    const quantity = parseFloat(quantityInput.value) || 0;
    const unitPrice = parseFloat(unitPriceInput.value) || 0;

    if (quantity > 0 && unitPrice > 0) {
      const totalQuantity = currentStock + quantity;

      if (totalQuantity > 0) {
        // 新药材 currentStock=0, currentCost=0，成本价直接等于进货单价
        const newCostPrice = (currentStock * currentCost + quantity * unitPrice) / totalQuantity;
        costPriceInput.value = newCostPrice.toFixed(2);
      }
    }
  }
}

/**
 * 处理成本价计算失焦事件
 * @param {Event} e - 失焦事件
 */
export async function handleCostCalcBlur(e) {
  const currentTable = _dependencies.getCurrentTable();
  if (currentTable !== 'stock_in_orders') return;

  const input = e.target;
  const tr = input.closest('tr');
  if (!tr) return;

  const herbNameInput = tr.querySelector('input[data-col="herbName"]');
  const quantityInput = tr.querySelector('input[data-col="quantity"]');
  const unitPriceInput = tr.querySelector('input[data-col="unitPrice"]');
  const costPriceInput = tr.querySelector('input[data-col="costPrice"]');

  if (!herbNameInput || !quantityInput || !unitPriceInput || !costPriceInput) return;

  const herbName = herbNameInput.value.trim();
  const quantity = parseFloat(quantityInput.value) || 0;
  const unitPrice = parseFloat(unitPriceInput.value) || 0;

  // 只有当药材名称、克数和进货单价都有值时才计算
  if (!herbName || quantity <= 0 || unitPrice <= 0) return;

  // 获取药材当前库存和成本价（新药材默认为 0）
  const herbInfo = window._herbInfoMap && window._herbInfoMap[herbName];
  const currentStock = herbInfo ? (parseFloat(herbInfo.stock) || 0) : 0;
  const currentCost = herbInfo ? (parseFloat(herbInfo.costPrice) || 0) : 0;

  // 计算新成本价：(库存克数*现成本价+进货克数*进货单价)/(库存克数+进货克数)
  // 新药材 currentStock=0, currentCost=0，成本价直接等于进货单价
  const totalQuantity = currentStock + quantity;
  if (totalQuantity <= 0) return;

  const newCostPrice = (currentStock * currentCost + quantity * unitPrice) / totalQuantity;

  // 始终填入计算值
  costPriceInput.value = newCostPrice.toFixed(2);
  // 更新灰色提示
  const hintSpan = costPriceInput.parentElement.querySelector('.field-hint');
  if (hintSpan) {
    hintSpan.textContent = herbInfo ? `(现成本:${currentCost.toFixed(2)})` : '(新药材)';
  }
}

/**
 * 重新计算某个订单下所有明细的成本价（用于展开时触发）
 * @param {string} orderId - 订单ID
 * @param {Object} [herbInfoMap] - 可选的药材信息映射（如果不提供则使用缓存）
 */
/**
 * 获取单个药材的信息（用于成本价计算）
 * @param {string} herbName - 药材名称
 * @returns {Promise<Object>} 药材信息 {salePrice, cabinetNo, costPrice, stock}
 */
export async function getHerbInfo(herbName) {
  if (!herbName) return null;

  try {
    const res = await _dependencies.homeFetch(`/api/stock/herbs?keyword=${encodeURIComponent(herbName)}&pageSize=1`);
    const herbsData = res.data?.rows || res.data || [];
    if (res.code === 0 && herbsData.length > 0) {
      const herb = herbsData[0];
      return {
        salePrice: herb.salePrice || 0,
        cabinetNo: herb.cabinetNo || '',
        costPrice: herb.costPrice || 0,
        stock: herb.stock || 0,
        unit: herb.unit || '克'
      };
    }
  } catch (err) {
    console.error('[StockModule] 获取药材信息失败:', err);
  }
  return null;
}

export function recalculateCostPricesForOrder(orderId, herbInfoMap = null) {
  // 获取该订单的所有明细行（包括新增行）
  const detailRows = document.querySelectorAll(`tr[data-order-id="${orderId}"]`);

  // 收集需要查询的药材名称
  const herbsToQuery = [];
  const herbInputsMap = new Map(); // herbName -> {row, input}

  detailRows.forEach((row) => {
    const herbNameInput = row.querySelector('input[data-col="herbName"]');
    const quantityInput = row.querySelector('input[data-col="quantity"]');
    const unitPriceInput = row.querySelector('input[data-col="unitPrice"]');
    const costPriceInput = row.querySelector('input[data-col="costPrice"]');

    if (!herbNameInput || !quantityInput || !unitPriceInput || !costPriceInput) return;

    const herbName = herbNameInput.value.trim();
    const quantity = parseFloat(quantityInput.value) || 0;
    const unitPrice = parseFloat(unitPriceInput.value) || 0;

    // 只有当克数和进货单价都有值时才计算
    if (!herbName || quantity <= 0 || unitPrice <= 0) return;

    herbsToQuery.push(herbName);
    herbInputsMap.set(herbName, { row, quantity, unitPrice, costPriceInput, herbNameInput });
  });

  // 并发查询所有需要的药材信息
  const queries = herbsToQuery.map(async (herbName) => {
    const info = await getHerbInfo(herbName);
    return { herbName, info };
  });

  Promise.all(queries).then(results => {
    // 构建 infoMap
    const infoMap = {};
    results.forEach(({ herbName, info }) => {
      if (info) infoMap[herbName] = info;
    });

    // 计算成本价（新药材 stock=0, cost=0，成本价直接等于进货单价）
    results.forEach(({ herbName, info }) => {
      const data = herbInputsMap.get(herbName);
      if (!data) return;

      const { row, quantity, unitPrice, costPriceInput, herbNameInput } = data;

      const currentStock = info ? (parseFloat(info.stock) || 0) : 0;
      const currentCost = info ? (parseFloat(info.costPrice) || 0) : 0;

      // 计算新成本价：(库存克数*现成本价+进货克数*进货单价)/(库存克数+进货克数)
      const totalQuantity = currentStock + quantity;
      if (totalQuantity <= 0) return;

      const newCostPrice = (currentStock * currentCost + quantity * unitPrice) / totalQuantity;

      // 更新成本价
      costPriceInput.value = newCostPrice.toFixed(2);
      // 更新灰色提示
      const hintSpan = costPriceInput.parentElement.querySelector('.field-hint');
      if (hintSpan) {
        hintSpan.textContent = info ? `(现成本:${currentCost.toFixed(2)})` : '(新药材)';
      }
    });
  });
}

/**
 * 异步更新成本价的灰色提示（现成本），动态获取药材信息
 * 用于在加载和展开时更新现成本提示，但不覆盖用户手动输入的成本价
 * @param {string} orderId - 订单ID
 */
export async function updateCostPriceHintsAsync(orderId) {
  // 获取该订单的所有明细行
  const detailRows = document.querySelectorAll(`tr[data-order-id="${orderId}"]`);

  // 收集需要查询的药材名称（去重）
  const herbsToQuery = new Set();
  detailRows.forEach((row) => {
    const herbNameInput = row.querySelector('input[data-col="herbName"]');
    if (herbNameInput && herbNameInput.value.trim()) {
      herbsToQuery.add(herbNameInput.value.trim());
    }
  });

  if (herbsToQuery.size === 0) return;

  // 并发查询所有需要的药材信息
  const queries = Array.from(herbsToQuery).map(async (herbName) => {
    const info = await getHerbInfo(herbName);
    return { herbName, info };
  });

  const results = await Promise.all(queries);

  // 构建 infoMap
  const infoMap = {};
  results.forEach(({ herbName, info }) => {
    if (info) infoMap[herbName] = info;
  });

  // 更新每个明细行的成本价提示
  detailRows.forEach((row) => {
    const herbNameInput = row.querySelector('input[data-col="herbName"]');
    const costPriceInput = row.querySelector('input[data-col="costPrice"]');

    if (!herbNameInput || !costPriceInput) return;

    const herbName = herbNameInput.value.trim();
    if (!herbName) return;

    // 获取药材当前成本价（新药材显示 "(新药材)"）
    const herbInfo = infoMap[herbName];
    const hintSpan = costPriceInput.parentElement.querySelector('.field-hint');
    if (hintSpan) {
      if (herbInfo) {
        const currentCost = parseFloat(herbInfo.costPrice) || 0;
        hintSpan.textContent = `(现成本:${currentCost.toFixed(2)})`;
      } else {
        hintSpan.textContent = '(新药材)';
      }
    }
  });
}

/**
 * 异步更新所有展开订单的成本价提示
 * @param {Set} expandedRows - 展开行的订单ID集合
 */
export async function updateAllCostPriceHints(expandedRows) {
  const promises = [];
  expandedRows.forEach(orderId => {
    promises.push(updateCostPriceHintsAsync(orderId));
  });
  await Promise.all(promises);
}

/**
 * 只更新成本价的灰色提示（现成本），不修改成本价输入框的值
 * 用于在加载和展开时更新现成本提示，但不覆盖用户手动输入的成本价
 * @param {string} orderId - 订单ID
 * @param {Object} herbInfoMap - 药材信息映射（可选，如果提供则使用，否则使用全局缓存）
 */
export function updateCostPriceHints(orderId, herbInfoMap = null) {
  // 使用传入的药材信息映射，如果没有则使用全局缓存
  const infoMap = herbInfoMap || window._herbInfoMap;

  // 获取该订单的所有明细行（包括新增行）
  const detailRows = document.querySelectorAll(`tr[data-order-id="${orderId}"]`);

  detailRows.forEach((row) => {
    const herbNameInput = row.querySelector('input[data-col="herbName"]');
    const costPriceInput = row.querySelector('input[data-col="costPrice"]');

    if (!herbNameInput || !costPriceInput) return;

    const herbName = herbNameInput.value.trim();
    if (!herbName) return;

    // 获取药材当前成本价
    const herbInfo = infoMap && infoMap[herbName];
    if (!herbInfo) return;

    const currentCost = parseFloat(herbInfo.costPrice) || 0;

    // 只更新灰色提示 - 使用最新的成本价
    const hintSpan = costPriceInput.parentElement.querySelector('.field-hint');
    if (hintSpan) {
      hintSpan.textContent = `(现成本:${currentCost.toFixed(2)})`;
    }
  });
}

// ==================== 订单创建和删除辅助函数 ====================

/**
 * 验证新增订单数据
 * @param {Object} data - 订单数据
 * @param {string} tableType - 表类型 ('stock_in_orders' 或 'stock_out_orders')
 * @returns {Object} { valid: boolean, error?: string }
 */
export function validateNewOrderData(data, tableType) {
  if (tableType === 'stock_in_orders') {
    if (!data || !data.supplierName) {
      return { valid: false, error: '请填写供应商名称' };
    }
  }
  return { valid: true };
}

/**
 * 获取创建订单的 API 路径
 * @param {string} tableType - 表类型
 * @returns {string} API 路径
 */
export function getCreateOrderApiPath(tableType) {
  if (tableType === 'stock_in_orders') {
    return '/api/stock/in/orders';
  } else if (tableType === 'stock_out_orders') {
    return '/api/stock/out/orders';
  }
  throw new Error(`未知的订单类型: ${tableType}`);
}

/**
 * 获取订单明细数量
 * @param {string} rowId - 订单 ID
 * @param {string} tableType - 表类型
 * @returns {Promise<number>} 明细数量
 */
export async function getOrderDetailCount(rowId, tableType) {
  try {
    const apiPath = tableType === 'stock_in_orders' 
      ? `/api/stock/in/orders/${rowId}` 
      : `/api/stock/out/orders/${rowId}`;
    
    const res = await _dependencies.homeFetch(apiPath);
    if (res.code !== 0) {
      console.error(`[StockModule] 获取订单详情失败:`, res.message);
      return 0;
    }
    
    return res.data?.items?.length || 0;
  } catch (err) {
    console.error(`[StockModule] 获取订单明细数量异常:`, err);
    return 0;
  }
}

/**
 * 处理删除前的确认逻辑
 * @param {string} rowId - 订单 ID
 * @param {Object} row - 订单数据
 * @param {string} tableType - 表类型
 * @returns {Object} { canDelete: boolean, needConfirm: boolean, message?: string, needSpecialHandling?: boolean }
 */
export function handleDeleteBeforeConfirm(rowId, row, tableType) {
  // 入库单已入库状态需要特殊处理
  if (tableType === 'stock_in_orders' && row && row.status === 'stocked') {
    return {
      canDelete: true,
      needSpecialHandling: true,
      message: '该入库单已入库，删除前需要先退回草稿。是否退回草稿并删除？'
    };
  }
  
  return {
    canDelete: true,
    needSpecialHandling: false
  };
}

/**
 * 获取删除订单的 API 路径
 * @param {string} rowId - 订单 ID
 * @param {string} tableType - 表类型
 * @returns {string} API 路径
 */
export function getDeleteApiPath(rowId, tableType) {
  if (tableType === 'stock_in_orders') {
    return `/api/stock/in/orders/${rowId}`;
  } else if (tableType === 'stock_out_orders') {
    return `/api/stock/out/orders/${rowId}`;
  }
  throw new Error(`未知的订单类型: ${tableType}`);
}

/**
 * 处理特殊删除逻辑（如已入库单需要先退回草稿）
 * @param {string} rowId - 订单 ID
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export async function handleSpecialDelete(rowId) {
  try {
    // 先退回草稿
    const revertRes = await _dependencies.homeFetch(`/api/stock/in/orders/${rowId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status: 'draft' })
    });
    
    if (revertRes.code !== 0) {
      return { success: false, error: '退回草稿失败: ' + revertRes.message };
    }
    
    // 再删除
    const deleteRes = await _dependencies.homeFetch(`/api/stock/in/orders/${rowId}`, { 
      method: 'DELETE' 
    });
    
    if (deleteRes.code !== 0) {
      return { success: false, error: deleteRes.message };
    }
    
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * 获取订单标签（用于提示信息）
 * @param {string} tableType - 表类型
 * @returns {Object} { orderLabel: string, detailLabel: string }
 */
export function getOrderLabels(tableType) {
  if (tableType === 'stock_in_orders') {
    return { orderLabel: '入库单', detailLabel: '入库明细' };
  } else if (tableType === 'stock_out_orders') {
    return { orderLabel: '执药单', detailLabel: '执药明细' };
  }
  return { orderLabel: '记录', detailLabel: '明细' };
}

// ==================== 药材管理API路径 ====================

/**
 * 获取药材管理的API路径
 * @param {string} operation - 操作类型 (list, create, update, delete)
 * @param {string} id - 记录ID（update和delete操作需要）
 * @returns {string} API路径
 */
export function getHerbApiPath(operation, id = null) {
  switch (operation) {
    case 'list':
      return '/api/stock/herbs';
    case 'create':
      return '/api/stock/herbs';
    case 'update':
      return `/api/stock/herbs/${id}`;
    case 'delete':
      return `/api/stock/herbs/${id}`;
    default:
      return `/api/stock/herbs`;
  }
}

/**
 * 处理药材批量删除（逐个删除）
 * @param {Array} ids - 要删除的药材ID数组
 * @returns {Promise<Object>} { success: boolean, deletedCount: number, error?: string }
 */
export async function handleHerbBatchDelete(ids) {
  try {
    let deletedCount = 0;
    
    for (const id of ids) {
      const res = await _dependencies.homeFetch(getHerbApiPath('delete', id), { method: 'DELETE' });
      if (res.code === 0) {
        deletedCount++;
      }
    }
    
    return { success: true, deletedCount };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ==================== 渲染订单详情 ====================

/**
 * 渲染入库单/执药单详情
 * @param {Object} row - 订单数据
 * @param {Object} config - 表格配置
 * @param {string} detailTable - 明细表名
 * @returns {string} HTML字符串
 */
export function renderOrderDetail(row, config, detailTable) {
  const columns = config.columns;
  const detailConfig = _dependencies.getTableConfig()[detailTable];
  const detailColumns = detailConfig ? detailConfig.columns : [];
  const items = row.items || [];
  const currentTable = _dependencies.getCurrentTable();

  let html = `<tr class="detail-row" data-parent-id="${row.id}">`;
  html += `<td colspan="${columns.length + 2}" class="detail-cell">`;
  html += `<div class="detail-content">`;

  // 执药单添加结算按钮
  if (currentTable === 'stock_out_orders') {
    const isPending = row.status === 'pending';
    html += `<div class="detail-header"><span>明细信息</span>`;
    if (isPending) {
      html += `<button class="action-btn action-btn-settle" data-action="settleOrder" data-order-id="${row.id}" data-prescription-id="${row.prescriptionId || ''}">确认结算</button>`;
    }
    html += `<button class="action-btn action-btn-export" data-action="exportDetail" data-order-id="${row.id}">导出</button></div>`;
  } else if (currentTable === 'stock_in_orders') {
    // 入库单明细
    html += `<div class="detail-header"><span>明细信息</span>`;
    html += `<button class="action-btn action-btn-export" data-action="exportDetail" data-order-id="${row.id}">导出</button></div>`;
  } else {
    html += `<div class="detail-header">明细信息</div>`;
  }

  html += `<table class="detail-table">`;
  // 执药单不显示本药总价列
  const filteredDetailColumns = currentTable === 'stock_out_orders'
    ? detailColumns.filter(col => col.key !== 'totalPrice')
    : detailColumns;
  html += `<thead><tr>${filteredDetailColumns.map(col => `<th>${col.label}</th>`).join('')}<th class="col-action">操作</th></tr></thead>`;
  html += `<tbody>`;

  // 已结算状态的执药单，明细只读
  // 已入库状态的入库单，明细只读
  const isSettled = currentTable === 'stock_out_orders' && row.status === 'settled';
  const isStocked = currentTable === 'stock_in_orders' && row.status === 'stocked';
  const isDetailReadonly = isSettled || isStocked;

  // 新增行（在第一行显示）
  if (!isDetailReadonly) {
    html += `<tr class="detail-new-row" data-order-id="${row.id}">`;
    filteredDetailColumns.forEach(col => {
      const isReadonly = col.readonly;
      const isDisabled = col.disabled;
      // ID和入库单ID始终只读
      const isAlwaysReadonly = col.key === 'id' || col.key === 'orderId';
      // 草稿状态的入库单：忽略 readonly 配置，允许编辑（但ID和orderId除外）
      // 执药单待执药状态：只允许编辑药材名称和克数
      const isInStockDraft = currentTable === 'stock_in_orders' && row.status === 'draft';
      const isOutStockPending = currentTable === 'stock_out_orders' && row.status === 'pending';
      const isEditableField = isOutStockPending && (col.key === 'herbName' || col.key === 'quantity');

      // 入库单草稿状态：所有字段可编辑
      // 执药单待执药状态：只有herbName和quantity可编辑
      const isActuallyReadonly = (isReadonly && !isInStockDraft && !isEditableField) || isAlwaysReadonly;

      // 跳过 totalPrice 列（入库明细不显示总价）
      if (col.key === 'totalPrice') {
        html += `<td style="display:none;"></td>`;
        return;
      }

      if (isActuallyReadonly) {
        html += `<td><span class="cell-readonly">自动</span></td>`;
      } else {
        let dataAttrs = ' data-is-new="true"';
        if (col.key === 'quantity' || col.key === 'unitPrice' || col.key === 'herbName') {
          dataAttrs += ' data-calc-source="true"';
        }
        // 入库明细：克数和进货单价用于计算成本价
        if (currentTable === 'stock_in_orders' && (col.key === 'quantity' || col.key === 'unitPrice')) {
          dataAttrs += ' data-cost-calc="true"';
        }
        if (col.key === 'cabinetNo') {
          dataAttrs += ' data-cabinet-no="true"';
        }
        const disabledAttr = isDisabled ? ' disabled' : '';
        if (currentTable === 'stock_in_orders' && col.key === 'costPrice') {
          // 入库明细成本价：新增行暂不显示当前成本
          html += `<td class="cell-with-hint"><input type="${col.type === 'number' ? 'number' : 'text'}" class="detail-input detail-new-input" data-col="${col.key}" placeholder="${col.label}"${dataAttrs}${disabledAttr}><span class="field-hint"></span></td>`;
        } else {
          html += `<td><input type="${col.type === 'number' ? 'number' : 'text'}" class="detail-input detail-new-input" data-col="${col.key}" placeholder="${col.label}"${dataAttrs}${disabledAttr}></td>`;
        }
      }
    });
    html += `<td class="col-action">
      <button class="action-btn action-btn-add" data-action="saveDetailNew" data-order-id="${row.id}">添加</button>
    </td>`;
    html += `</tr>`;
  }

  // 已有明细
  items.forEach(item => {
    html += `<tr data-detail-id="${item.id}" data-order-id="${row.id}">`;
    
    // 执药单跳过 totalPrice 列
    const columnsToRender = currentTable === 'stock_out_orders'
      ? detailColumns.filter(col => col.key !== 'totalPrice')
      : detailColumns;
    
    columnsToRender.forEach(col => {
      const value = item[col.key] ?? '';
      const isReadonly = col.readonly;
      const isDisabled = col.disabled;

      // ID和入库单ID始终只读
      const isAlwaysReadonly = col.key === 'id' || col.key === 'orderId';
      
      // 草稿状态的入库单：忽略 readonly 配置，允许编辑（但ID和orderId除外）
      // 执药单待执药状态：允许编辑药材名称和克数
      const isInStockDraft = currentTable === 'stock_in_orders' && row.status === 'draft';
      const isOutStockPending = currentTable === 'stock_out_orders' && row.status === 'pending';
      const isEditableField = isOutStockPending && (col.key === 'herbName' || col.key === 'quantity');
      
      const isActuallyReadonly = isDetailReadonly || isAlwaysReadonly || (isReadonly && !isInStockDraft && !isEditableField);

      if (isActuallyReadonly) {
        html += `<td><span class="cell-readonly">${value || '-'}</span></td>`;
      } else {
        let dataAttrs = ` data-detail-id="${item.id}" data-order-id="${row.id}"`;
        if (col.key === 'quantity' || col.key === 'unitPrice' || col.key === 'herbName') {
          dataAttrs += ' data-calc-source="true"';
        }
        // 入库明细：克数和进货单价用于计算成本价
        if (currentTable === 'stock_in_orders' && (col.key === 'quantity' || col.key === 'unitPrice')) {
          dataAttrs += ' data-cost-calc="true"';
        }
        if (col.key === 'cabinetNo') {
          dataAttrs += ' data-cabinet-no="true"';
        }
        const disabledAttr = isDisabled ? ' disabled' : '';
        if (currentTable === 'stock_in_orders' && col.key === 'costPrice') {
          // 入库明细成本价：直接使用数据库中保存的值，不重新计算
          const herbInfo = _herbInfoMap && _herbInfoMap[item.herbName];
          const currentCost = herbInfo ? parseFloat(herbInfo.costPrice) || 0 : 0;
          
          html += `<td class="cell-with-hint"><input type="${col.type === 'number' ? 'number' : 'text'}" class="detail-input" data-col="${col.key}" value="${_dependencies.escapeHtml(String(value))}"${dataAttrs}${disabledAttr}><span class="field-hint">(现成本:${currentCost.toFixed(2)})</span></td>`;
        } else {
          html += `<td><input type="${col.type === 'number' ? 'number' : 'text'}" class="detail-input" data-col="${col.key}" value="${_dependencies.escapeHtml(String(value))}"${dataAttrs}${disabledAttr}></td>`;
        }
      }
    });

    if (isDetailReadonly) {
      html += `<td class="col-action"><span class="cell-readonly">-</span></td>`;
    } else {
      html += `<td class="col-action">
        <button class="action-btn action-btn-save" data-action="saveDetail" data-id="${item.id}" data-order-id="${row.id}">保存</button>
        <button class="action-btn action-btn-delete" data-action="deleteDetail" data-id="${item.id}" data-order-id="${row.id}">删除</button>
      </td>`;
    }
    html += `</tr>`;
  });

  html += `</tbody></table>`;
  html += `</div></td></tr>`;
  return html;
}

// ==================== 事件处理器配置 ====================

/**
 * 入库单事件处理器
 */
export const stockInOrdersHandlers = {
  /**
   * 加载数据
   */
  onLoad: async (page, pageSize, keyword) => {
    const config = _dependencies.getTableConfig?.();
    const searchFieldsParam = config?.searchFields ? `&searchFields=${config.searchFields.join(',')}` : '';
    const res = await _dependencies.homeFetch(`/api/stock/in/orders?page=${page}&pageSize=${pageSize}&keyword=${encodeURIComponent(keyword)}${searchFieldsParam}`);
    if (res.code !== 0) throw new Error(res.message);
    const rows = res.data?.rows || [];
    return {
      data: rows,
      pagination: res.data?.pagination || { page: 1, pageSize: 20, totalCount: rows.length, totalPages: 1 }
    };
  },

  /**
   * 保存行
   */
  onSave: async (rowId, rowElement) => {
    try {
      const inputs = rowElement.querySelectorAll('.cell-input, .cell-select');
      const data = {};
      inputs.forEach(input => {
        data[input.dataset.col] = input.value;
      });

      const res = await _dependencies.homeFetch(`/api/stock/in/orders/${rowId}`, {
        method: 'PUT',
        body: JSON.stringify(data)
      });
      if (res.code !== 0) throw new Error(res.message);

      _dependencies.showToast('保存成功', 'success');
      _dependencies.setEditingRowId?.(null);
      _dependencies.clearSelectedIds?.();
      _dependencies.loadTableData();
      _dependencies.loadStats();
      return res;
    } catch (err) {
      _dependencies.showToast('保存失败: ' + err.message, 'error');
      throw err;
    }
  },

  /**
   * 保存新增行
   */
  onSaveNew: async (rowElement) => {
    try {
      const inputs = rowElement.querySelectorAll('.cell-input, .cell-select');
      const data = {};
      inputs.forEach(input => {
        if (input.value.trim()) {
          data[input.dataset.col] = input.value.trim();
        }
      });

      const validation = validateNewOrderData(data, 'stock_in_orders');
      if (!validation.valid) {
        _dependencies.showToast(validation.error, 'error');
        return;
      }

      const res = await _dependencies.homeFetch(getCreateOrderApiPath('stock_in_orders'), {
        method: 'POST',
        body: JSON.stringify(data)
      });
      if (res.code !== 0) throw new Error(res.message);

      _dependencies.showToast('新增成功', 'success');
      _dependencies.setEditingRowId?.(null);
      _dependencies.clearSelectedIds?.();
      _dependencies.loadTableData();
      _dependencies.loadStats();
      return res;
    } catch (err) {
      _dependencies.showToast('新增失败: ' + err.message, 'error');
      throw err;
    }
  },

  /**
   * 删除行
   */
  onDelete: async (rowId, row) => {
    // 检查是否需要特殊处理
    const handleResult = handleDeleteBeforeConfirm(rowId, row, 'stock_in_orders');
    if (handleResult.needSpecialHandling) {
      return new Promise((resolve, reject) => {
        _dependencies.showConfirm('确认删除', handleResult.message, async () => {
          try {
            const result = await handleSpecialDelete(rowId);
            if (!result.success) {
              throw new Error(result.error);
            }
            _dependencies.showToast('删除成功', 'success');
            _dependencies.setEditingRowId?.(null);
            _dependencies.clearSelectedIds?.();
            _dependencies.loadTableData();
            _dependencies.loadStats();
            resolve(result);
          } catch (err) {
            _dependencies.showToast('删除失败: ' + err.message, 'error');
            reject(err);
          }
        });
      });
    }

    // 获取明细数量用于确认提示
    const detailCount = await getOrderDetailCount(rowId, 'stock_in_orders');
    const labels = getOrderLabels('stock_in_orders');
    const confirmMessage = detailCount > 0
      ? `确定要删除这条${labels.orderLabel}吗？\n\n⚠️ 关联的 ${detailCount} 条${labels.detailLabel}也将一并删除！`
      : `确定要删除这条${labels.orderLabel}吗？`;

    return new Promise((resolve, reject) => {
      _dependencies.showConfirm('确认删除', confirmMessage, async () => {
        try {
          const deleteApi = getDeleteApiPath(rowId, 'stock_in_orders');
          const res = await _dependencies.homeFetch(deleteApi, { method: 'DELETE' });
          if (res.code !== 0) throw new Error(res.message);

          _dependencies.showToast('删除成功', 'success');
          _dependencies.setEditingRowId?.(null);
          _dependencies.clearSelectedIds?.();
          _dependencies.loadTableData();
          _dependencies.loadStats();
          resolve(res);
        } catch (err) {
          _dependencies.showToast('删除失败: ' + err.message, 'error');
          reject(err);
        }
      });
    });
  },

  /**
   * 批量删除
   */
  onBatchDelete: async (ids) => {
    // 统计明细数量
    let totalDetailCount = 0;
    for (const id of ids) {
      totalDetailCount += await getOrderDetailCount(id, 'stock_in_orders');
    }
    const labels = getOrderLabels('stock_in_orders');
    const confirmMessage = totalDetailCount > 0
      ? `确定要删除选中的 ${ids.length} 条${labels.orderLabel}吗？\n\n⚠️ 关联的 ${totalDetailCount} 条${labels.detailLabel}也将一并删除！`
      : `确定要删除选中的 ${ids.length} 条${labels.orderLabel}吗？`;

    return new Promise((resolve, reject) => {
      _dependencies.showConfirm('批量删除', confirmMessage, async () => {
        try {
          let deletedCount = 0;
          for (const id of ids) {
            const deleteApi = getDeleteApiPath(id, 'stock_in_orders');
            const res = await _dependencies.homeFetch(deleteApi, { method: 'DELETE' });
            if (res.code !== 0) {
              throw new Error(`删除入库单失败: ${res.message}`);
            }
            deletedCount++;
          }
          _dependencies.showToast(`成功删除 ${deletedCount} 条记录`, 'success');
          _dependencies.clearSelectedIds?.();
          _dependencies.loadTableData();
          _dependencies.loadStats();
          resolve({ success: true, deletedCount });
        } catch (err) {
          _dependencies.showToast('批量删除失败: ' + err.message, 'error');
          _dependencies.loadTableData();
          reject(err);
        }
      });
    });
  }
};

/**
 * 执药单事件处理器
 */
export const stockOutOrdersHandlers = {
  /**
   * 加载数据
   */
  onLoad: async (page, pageSize, keyword) => {
    const config = _dependencies.getTableConfig?.();
    const searchFieldsParam = config?.searchFields ? `&searchFields=${config.searchFields.join(',')}` : '';
    const res = await _dependencies.homeFetch(`/api/stock/out/orders?page=${page}&pageSize=${pageSize}&keyword=${encodeURIComponent(keyword)}${searchFieldsParam}`);
    if (res.code !== 0) throw new Error(res.message);
    const rows = res.data?.rows || [];
    return {
      data: rows,
      pagination: res.data?.pagination || { page: 1, pageSize: 20, totalCount: rows.length, totalPages: 1 }
    };
  },

  /**
   * 保存行
   */
  onSave: async (rowId, rowElement) => {
    try {
      const inputs = rowElement.querySelectorAll('.cell-input, .cell-select');
      const data = {};
      inputs.forEach(input => {
        data[input.dataset.col] = input.value;
      });

      const res = await _dependencies.homeFetch(`/api/stock/out/orders/${rowId}`, {
        method: 'PUT',
        body: JSON.stringify(data)
      });
      if (res.code !== 0) throw new Error(res.message);

      _dependencies.showToast('保存成功', 'success');
      _dependencies.setEditingRowId?.(null);
      _dependencies.clearSelectedIds?.();
      _dependencies.loadTableData();
      _dependencies.loadStats();
      return res;
    } catch (err) {
      _dependencies.showToast('保存失败: ' + err.message, 'error');
      throw err;
    }
  },

  /**
   * 保存新增行
   */
  onSaveNew: async (rowElement) => {
    try {
      const inputs = rowElement.querySelectorAll('.cell-input, .cell-select');
      const data = {};
      inputs.forEach(input => {
        if (input.value.trim()) {
          data[input.dataset.col] = input.value.trim();
        }
      });

      const res = await _dependencies.homeFetch(getCreateOrderApiPath('stock_out_orders'), {
        method: 'POST',
        body: JSON.stringify(data)
      });
      if (res.code !== 0) throw new Error(res.message);

      _dependencies.showToast('新增成功', 'success');
      _dependencies.setEditingRowId?.(null);
      _dependencies.clearSelectedIds?.();
      _dependencies.loadTableData();
      _dependencies.loadStats();
      return res;
    } catch (err) {
      _dependencies.showToast('新增失败: ' + err.message, 'error');
      throw err;
    }
  },

  /**
   * 删除行
   */
  onDelete: async (rowId, row) => {
    // 获取明细数量用于确认提示
    const detailCount = await getOrderDetailCount(rowId, 'stock_out_orders');
    const labels = getOrderLabels('stock_out_orders');
    const confirmMessage = detailCount > 0
      ? `确定要删除这条${labels.orderLabel}吗？\n\n⚠️ 关联的 ${detailCount} 条${labels.detailLabel}也将一并删除！`
      : `确定要删除这条${labels.orderLabel}吗？`;

    return new Promise((resolve, reject) => {
      _dependencies.showConfirm('确认删除', confirmMessage, async () => {
        try {
          const deleteApi = getDeleteApiPath(rowId, 'stock_out_orders');
          const res = await _dependencies.homeFetch(deleteApi, { method: 'DELETE' });
          if (res.code !== 0) throw new Error(res.message);

          _dependencies.showToast('删除成功', 'success');
          _dependencies.setEditingRowId?.(null);
          _dependencies.clearSelectedIds?.();
          _dependencies.loadTableData();
          _dependencies.loadStats();
          resolve(res);
        } catch (err) {
          _dependencies.showToast('删除失败: ' + err.message, 'error');
          reject(err);
        }
      });
    });
  },

  /**
   * 批量删除
   */
  onBatchDelete: async (ids) => {
    // 统计明细数量
    let totalDetailCount = 0;
    for (const id of ids) {
      totalDetailCount += await getOrderDetailCount(id, 'stock_out_orders');
    }
    const labels = getOrderLabels('stock_out_orders');
    const confirmMessage = totalDetailCount > 0
      ? `确定要删除选中的 ${ids.length} 条${labels.orderLabel}吗？\n\n⚠️ 关联的 ${totalDetailCount} 条${labels.detailLabel}也将一并删除！`
      : `确定要删除选中的 ${ids.length} 条${labels.orderLabel}吗？`;

    return new Promise((resolve, reject) => {
      _dependencies.showConfirm('批量删除', confirmMessage, async () => {
        try {
          let deletedCount = 0;
          for (const id of ids) {
            const deleteApi = getDeleteApiPath(id, 'stock_out_orders');
            const res = await _dependencies.homeFetch(deleteApi, { method: 'DELETE' });
            if (res.code !== 0) {
              throw new Error(`删除执药单失败: ${res.message}`);
            }
            deletedCount++;
          }
          _dependencies.showToast(`成功删除 ${deletedCount} 条记录`, 'success');
          _dependencies.clearSelectedIds?.();
          _dependencies.loadTableData();
          _dependencies.loadStats();
          resolve({ success: true, deletedCount });
        } catch (err) {
          _dependencies.showToast('批量删除失败: ' + err.message, 'error');
          _dependencies.loadTableData();
          reject(err);
        }
      });
    });
  }
};

// ==================== 导出模块实例供全局访问 ====================
if (typeof window !== 'undefined') {
  window._stockModule = {
    initStockModule,
    getHerbInfoMap,
    getHerbInfo,
    clearHerbInfoCache,
    confirmStockIn,
    revertToDraft,
    settleOutOrder,
    revokeSettledOrder,
    saveDetailNewAuto,
    saveDetailEdit,
    removeDetailRow,
    calculateOrderTotalAmount,
    calculateDetailTotalPrice,
    handleHerbNameInput,
    handleCostCalcBlur,
    recalculateCostPricesForOrder,
    updateCostPriceHints,
    updateCostPriceHintsAsync,
    updateAllCostPriceHints,
    validateNewOrderData,
    getCreateOrderApiPath,
    getOrderDetailCount,
    handleDeleteBeforeConfirm,
    getDeleteApiPath,
    handleSpecialDelete,
    getOrderLabels,
    getHerbApiPath,
    handleHerbBatchDelete,
    renderOrderDetail,
    stockInOrdersHandlers,
    stockOutOrdersHandlers
  };
}