// ==================== 预约管理模块 ====================

/**
 * 依赖项（需要在使用前通过 initBookingsModule 设置）
 */
const _dependencies = {
  getCurrentTable: null,
  getTableData: null,
  homeFetch: null,
  showToast: null,
  showConfirm: null,
  loadTableData: null,
  loadStats: null,
  getEditingRowId: null,
  setEditingRowId: null,
  clearSelectedIds: null
};

/**
 * 初始化预约管理模块
 * @param {Object} dependencies - 依赖项对象
 */
export function initBookingsModule(dependencies) {
  Object.assign(_dependencies, dependencies);
}

/**
 * 保存预约
 * @param {string} rowId - 预约ID
 * @param {Object} data - 预约数据
 * @returns {Promise<Object>} 保存结果
 */
export async function saveBooking(rowId, data) {
  const res = await _dependencies.homeFetch(`/api/bookings/${rowId}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  });
  return res;
}

/**
 * 删除预约
 * @param {string} rowId - 预约ID
 * @returns {Promise<Object>} 删除结果
 */
export async function deleteBooking(rowId) {
  const res = await _dependencies.homeFetch(`/api/booking/${rowId}`, {
    method: 'DELETE'
  });
  return res;
}

/**
 * 加载预约列表数据
 * @param {number} page - 页码
 * @param {number} pageSize - 每页数量
 * @param {string} keyword - 搜索关键词
 * @returns {Promise<Object>} { data: Array, pagination: Object }
 */
export async function loadBookingsData(page, pageSize, keyword) {
  const res = await _dependencies.homeFetch(`/api/bookings?page=${page}&pageSize=${pageSize}&keyword=${encodeURIComponent(keyword)}`);
  if (res.code !== 0) throw new Error(res.message);
  return {
    data: res.data?.rows || [],
    pagination: res.data?.pagination || {}
  };
}

/**
 * 预约模块的事件处理器（供 tableHandlers 使用）
 */
export const bookingsHandlers = {
  /**
   * 加载数据
   */
  onLoad: async (page, pageSize, keyword) => {
    return loadBookingsData(page, pageSize, keyword);
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

      const res = await saveBooking(rowId, data);
      if (res.code !== 0) throw new Error(res.message);

      // 退出编辑状态
      if (_dependencies.setEditingRowId) {
        _dependencies.setEditingRowId(null);
      }
      if (_dependencies.clearSelectedIds) {
        _dependencies.clearSelectedIds();
      }

      // 保存成功后刷新页面
      _dependencies.showToast('保存成功', 'success');
      _dependencies.loadTableData();
      _dependencies.loadStats();
      return res;
    } catch (err) {
      _dependencies.showToast('保存失败: ' + err.message, 'error');
      throw err;
    }
  },

  /**
   * 删除行
   */
  onDelete: async (rowId) => {
    try {
      const res = await deleteBooking(rowId);
      if (res.code !== 0) throw new Error(res.message);

      // 退出编辑状态（如果删除的是正在编辑的行）
      if (_dependencies.getEditingRowId && _dependencies.setEditingRowId) {
        const currentEditingId = _dependencies.getEditingRowId();
        if (currentEditingId && String(currentEditingId) === String(rowId)) {
          _dependencies.setEditingRowId(null);
        }
      }
      if (_dependencies.clearSelectedIds) {
        _dependencies.clearSelectedIds();
      }

      // 删除成功后刷新页面
      _dependencies.showToast('删除成功', 'success');
      _dependencies.loadTableData();
      _dependencies.loadStats();
      return res;
    } catch (err) {
      _dependencies.showToast('删除失败: ' + err.message, 'error');
      throw err;
    }
  }
};

// ==================== 导出模块实例供全局访问 ====================
if (typeof window !== 'undefined') {
  window._bookingsModule = {
    initBookingsModule,
    saveBooking,
    deleteBooking,
    loadBookingsData,
    bookingsHandlers
  };
}