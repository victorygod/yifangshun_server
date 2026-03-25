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
  getExpandedRows: () => new Set() // 获取展开的行
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
 * @returns {Promise<Object>} 药材信息映射表 {herbName: {salePrice, cabinetNo, costPrice, stock}}
 */
export async function getHerbInfoMap() {
  if (herbInfoCache) return herbInfoCache;

  try {
    const res = await _dependencies.homeFetch('/api/stock/herbs');
    if (res.code === 0 && res.data && res.data.rows) {
      herbInfoCache = {};
      res.data.rows.forEach(herb => {
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
 * 计算入库单总金额（所有明细的 克数*进货单价 之和）
 * @param {string} orderId - 订单ID
 */
export function calculateOrderTotalAmount(orderId) {
  const currentTable = _dependencies.getCurrentTable();
  
  if (currentTable !== 'stock_in_orders') return;
  
  const detailRows = document.querySelectorAll(`tr[data-order-id="${orderId}"]`);
  const newRows = document.querySelectorAll(`tr.detail-new-row[data-order-id="${orderId}"]`);
  
  let totalAmount = 0;
  
  // 遍历现有明细行
  detailRows.forEach(row => {
    const quantityInput = row.querySelector('.detail-input[data-col="quantity"]');
    const unitPriceInput = row.querySelector('.detail-input[data-col="unitPrice"]');
    
    if (quantityInput && unitPriceInput) {
      const quantity = parseFloat(quantityInput.value) || 0;
      const unitPrice = parseFloat(unitPriceInput.value) || 0;
      totalAmount += quantity * unitPrice;
    }
  });
  
  // 遍历新增行
  newRows.forEach(row => {
    const quantityInput = row.querySelector('.detail-input[data-col="quantity"]');
    const unitPriceInput = row.querySelector('.detail-input[data-col="unitPrice"]');
    
    if (quantityInput && unitPriceInput) {
      const quantity = parseFloat(quantityInput.value) || 0;
      const unitPrice = parseFloat(unitPriceInput.value) || 0;
      totalAmount += quantity * unitPrice;
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
  const calculatedTotal = (quantity * unitPrice).toFixed(2);

  // 自动更新总价
  totalPriceInput.value = calculatedTotal;
  totalPriceInput.dataset.autoCalc = 'true';
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
  
  if (herbName && window._herbInfoMap && window._herbInfoMap[herbName]) {
    const herbInfo = window._herbInfoMap[herbName];
    if (hintSpan) {
      hintSpan.textContent = `(现成本:${(herbInfo.costPrice || 0).toFixed(2)})`;
    }
    
    // 如果克数和进货价已填写，自动计算成本价
    if (quantityInput && unitPriceInput && costPriceInput) {
      const quantity = parseFloat(quantityInput.value) || 0;
      const unitPrice = parseFloat(unitPriceInput.value) || 0;
      
      if (quantity > 0 && unitPrice > 0) {
        const currentStock = parseFloat(herbInfo.stock) || 0;
        const currentCost = parseFloat(herbInfo.costPrice) || 0;
        const totalQuantity = currentStock + quantity;
        
        if (totalQuantity > 0) {
          const newCostPrice = (currentStock * currentCost + quantity * unitPrice) / totalQuantity;
          costPriceInput.value = newCostPrice.toFixed(2);
        }
      }
    }
  } else if (hintSpan) {
    hintSpan.textContent = '';
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

  // 获取药材当前库存和成本价
  const herbInfo = window._herbInfoMap && window._herbInfoMap[herbName];
  if (!herbInfo) return;

  const currentStock = parseFloat(herbInfo.stock) || 0;
  const currentCost = parseFloat(herbInfo.costPrice) || 0;

  // 计算新成本价：(库存克数*现成本价+进货克数*进货单价)/(库存克数+进货克数)
  const totalQuantity = currentStock + quantity;
  if (totalQuantity <= 0) return;

  const newCostPrice = (currentStock * currentCost + quantity * unitPrice) / totalQuantity;

  // 始终填入计算值
  costPriceInput.value = newCostPrice.toFixed(2);
  // 更新灰色提示
  const hintSpan = costPriceInput.parentElement.querySelector('.field-hint');
  if (hintSpan) {
    hintSpan.textContent = `(现成本:${currentCost.toFixed(2)})`;
  }
}

/**
 * 重新计算某个订单下所有明细的成本价（用于展开时触发）
 * @param {string} orderId - 订单ID
 * @param {Object} [herbInfoMap] - 可选的药材信息映射（如果不提供则使用缓存）
 */
export function recalculateCostPricesForOrder(orderId, herbInfoMap = null) {
  // 使用传入的药材信息映射，如果没有则使用全局缓存
  const infoMap = herbInfoMap || window._herbInfoMap;
  
  // 获取该订单的所有明细行（不包括新增行）
  const detailRows = document.querySelectorAll(`tr[data-order-id="${orderId}"]:not(.detail-new-row)`);
  
  detailRows.forEach((row, index) => {
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
    
    // 获取药材当前库存和成本价
    const herbInfo = infoMap && infoMap[herbName];
    if (!herbInfo) return;
    
    const currentStock = parseFloat(herbInfo.stock) || 0;
    const currentCost = parseFloat(herbInfo.costPrice) || 0;
    
    // 计算新成本价：(库存克数*现成本价+进货克数*进货单价)/(库存克数+进货克数)
    const totalQuantity = currentStock + quantity;
    if (totalQuantity <= 0) return;
    
    const newCostPrice = (currentStock * currentCost + quantity * unitPrice) / totalQuantity;
    
    // 更新成本价
    costPriceInput.value = newCostPrice.toFixed(2);
    // 更新灰色提示 - 使用最新的成本价
    const hintSpan = costPriceInput.parentElement.querySelector('.field-hint');
    if (hintSpan) {
      hintSpan.textContent = `(现成本:${currentCost.toFixed(2)})`;
    }
  });
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
  
  // 获取该订单的所有明细行（不包括新增行）
  const detailRows = document.querySelectorAll(`tr[data-order-id="${orderId}"]:not(.detail-new-row)`);
  
  detailRows.forEach((row) => {
    const herbNameInput = row.querySelector('input[data-col="herbName"]');
    const costPriceInput = row.querySelector('input[data-col="costPrice"]');
    
    if (!herbNameInput || !costPriceInput) return;
    
    const herbName = herbNameInput.value.trim();
    
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

// ==================== 放大展示执药单明细 ====================

/**
 * 显示放大详情
 * @param {string} orderId - 订单ID
 */
export async function showZoomDetail(orderId) {
  const currentTable = _dependencies.getCurrentTable();
  const apiPath = currentTable === 'stock_in_orders' ? `/api/stock/in/orders/${orderId}` : `/api/stock/out/orders/${orderId}`;
  
  try {
    const res = await _dependencies.homeFetch(apiPath);
    if (res.code !== 0) throw new Error(res.message);
    
    const order = res.data;
    if (!order || !order.items) return;

    // 创建模态框（如果不存在）
    let zoomModal = document.getElementById('zoomModal');
    if (!zoomModal) {
      zoomModal = document.createElement('div');
      zoomModal.id = 'zoomModal';
      zoomModal.className = 'zoom-modal';
      zoomModal.innerHTML = `
        <div class="zoom-modal-content">
          <div class="zoom-modal-header">
            <h3>执药单明细</h3>
            <button class="zoom-modal-close" onclick="window._stockModule.closeZoomModal()">×</button>
          </div>
          <div class="zoom-modal-body">
            <table class="zoom-table">
              <thead>
                <tr>
                  <th>药材名称</th>
                  <th>柜号</th>
                  <th>克数</th>
                </tr>
              </thead>
              <tbody id="zoomTableBody"></tbody>
            </table>
          </div>
        </div>
      `;
      document.body.appendChild(zoomModal);
      
      // 绑定点击关闭事件
      zoomModal.addEventListener('click', (e) => {
        if (e.target === zoomModal) {
          closeZoomModal();
        }
      });
    }

    const tbody = document.getElementById('zoomTableBody');
    tbody.innerHTML = order.items.map(item => `
      <tr>
        <td>${_dependencies.escapeHtml(item.herbName || '-')}</td>
        <td>${_dependencies.escapeHtml(item.cabinetNo || '-')}</td>
        <td>${_dependencies.escapeHtml(item.quantity || '-')}</td>
      </tr>
    `).join('');

    zoomModal.classList.add('show');
  } catch (err) {
    _dependencies.showToast('加载明细失败: ' + err.message, 'error');
  }
}

/**
 * 关闭放大模态框
 */
export function closeZoomModal() {
  const zoomModal = document.getElementById('zoomModal');
  if (zoomModal) {
    zoomModal.classList.remove('show');
  }
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
    return `/api/admin/table/${tableType}`;
  }
  return `/api/admin/table/${tableType}`;
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
  if (tableType === 'stock_in_orders' || tableType === 'stock_out_orders') {
    return `/api/${tableType.replace('_', '/')}/${rowId}`;
  }
  return `/api/admin/table/${tableType}/${rowId}`;
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

// ==================== 导出模块实例供全局访问 ====================
if (typeof window !== 'undefined') {
  window._stockModule = {
    initStockModule,
    getHerbInfoMap,
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
    showZoomDetail,
    closeZoomModal,
    validateNewOrderData,
    getCreateOrderApiPath,
    getOrderDetailCount,
    handleDeleteBeforeConfirm,
    getDeleteApiPath,
    handleSpecialDelete,
    getOrderLabels,
    getHerbApiPath,
    handleHerbBatchDelete
  };
}