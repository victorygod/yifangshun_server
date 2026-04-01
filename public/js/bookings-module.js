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
   * 保存新增行（预约管理不支持新增）
   */
  onSaveNew: async () => {
    _dependencies.showToast('预约管理不支持新增', 'error');
    return;
  },

  /**
   * 删除行
   */
  onDelete: async (rowId) => {
    return new Promise((resolve, reject) => {
      _dependencies.showConfirm('确认删除', '确定要删除这条预约吗？', async () => {
        try {
          const res = await deleteBooking(rowId);
          if (res.code !== 0) throw new Error(res.message);

          _dependencies.showToast('删除成功', 'success');
          _dependencies.setEditingRowId?.(null);
          _dependencies.clearSelectedIds?.();
          _dependencies.loadTableData();
          _dependencies.loadStats();
          resolve(res);
        } catch (err) {
          _dependencies.showToast('删除删除失败: ' + err.message, 'error');
          reject(err);
        }
      });
    });
  },

  /**
   * 批量删除
   */
  onBatchDelete: async (ids) => {
    const confirmMessage = `确定要删除选中的 ${ids.length} 条预约吗？`;

    return new Promise((resolve, reject) => {
      _dependencies.showConfirm('批量删除', confirmMessage, async () => {
        try {
          let deletedCount = 0;
          for (const id of ids) {
            const res = await deleteBooking(id);
            if (res.code === 0) {
              deletedCount++;
            } else {
              throw new Error(`删除预约失败: ${res.message}`);
            }
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
  window._bookingsModule = {
    initBookingsModule,
    saveBooking,
    deleteBooking,
    loadBookingsData,
    bookingsHandlers
  };
}