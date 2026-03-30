// ==================== 表格通用工具函数 ====================

/**
 * 表格通用操作工具函数
 * 供 tableHandlers 调用
 */

// 依赖项
let _dependencies = {
  getCurrentPage: null,
  setCurrentPage: null,
  getEditingRowId: null,
  setEditingRowId: null,
  getSelectedIds: null,
  setSelectedIds: null,
  getExpandedRows: null,
  setExpandedRows: null,
  loadTableData: null
};

/**
 * 初始化 table-util 模块
 * @param {Object} dependencies - 依赖项对象
 */
export function initTableUtil(dependencies) {
  Object.assign(_dependencies, dependencies);
}

// 分页
export function goToPage(page) {
  if (_dependencies.setCurrentPage) {
    _dependencies.setCurrentPage(page);
  }
  if (_dependencies.setEditingRowId) {
    _dependencies.setEditingRowId(null);
  }
  if (_dependencies.setSelectedIds) {
    _dependencies.setSelectedIds([]);
  }
  if (_dependencies.loadTableData) {
    _dependencies.loadTableData();
  }
}

// 取消编辑
export function cancelEdit() {
  if (_dependencies.setEditingRowId) {
    _dependencies.setEditingRowId(null);
  }
  if (_dependencies.setSelectedIds) {
    _dependencies.setSelectedIds([]);
  }
  if (_dependencies.loadTableData) {
    _dependencies.loadTableData();
  }
}

// 切换详情展开
export function toggleDetail(id) {
  if (!_dependencies.getExpandedRows || !_dependencies.setExpandedRows) {
    console.error('[table-util] expandedRows 依赖未初始化');
    return;
  }

  const expandedRows = _dependencies.getExpandedRows();
  const idStr = String(id);

  if (expandedRows.has(idStr)) {
    expandedRows.delete(idStr);
  } else {
    expandedRows.add(idStr);
  }
  _dependencies.setExpandedRows(expandedRows);

  if (_dependencies.loadTableData) {
    _dependencies.loadTableData();
  }
}

// 收集行数据
export function collectRowData(rowElement) {
  const inputs = rowElement.querySelectorAll('.cell-input, .cell-select');
  const data = {};
  inputs.forEach(input => {
    data[input.dataset.col] = input.value;
  });
  return data;
}

// 获取行元素
export function getRowElement(rowId) {
  return document.querySelector(`tr[data-id="${rowId}"]`);
}

// ==================== 导出模块实例供全局访问 ====================
if (typeof window !== 'undefined') {
  window._tableUtil = {
    initTableUtil,
    goToPage,
    cancelEdit,
    toggleDetail,
    collectRowData,
    getRowElement
  };
}