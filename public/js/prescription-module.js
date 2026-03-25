// ==================== 处方管理模块 ====================

/**
 * 依赖项（需要在使用前通过 initPrescriptionModule 设置）
 */
const _dependencies = {
  homeFetch: null,
  showToast: null,
  showAlert: null,
  loadTableData: null
};

/**
 * 初始化处方模块
 * @param {Object} dependencies - 依赖项对象
 */
export function initPrescriptionModule(dependencies) {
  Object.assign(_dependencies, dependencies);
  console.log('[PrescriptionModule] 已初始化依赖');
}

/**
 * 保存处方详情修改
 * @param {number} rowId - 处方行ID
 */
export async function savePrescriptionDetail(rowId) {
  const detailRow = document.querySelector(`tr.detail-row[data-parent-id="${rowId}"]`);
  if (!detailRow) return;

  // 收集表单数据
  const fields = ['prescriptionId', 'name', 'age', 'date', 'dosage', 'administrationMethod', 'doctor', 'rp'];
  const data = {};
  
  fields.forEach(field => {
    const input = detailRow.querySelector(`[data-field="${field}"]`);
    if (input) {
      data[field] = input.value;
    }
  });

  // 收集药材数据
  const medicines = [];
  const tbody = document.getElementById(`medicines-body-${rowId}`);
  if (tbody) {
    Array.from(tbody.querySelectorAll('tr')).forEach(tr => {
      const nameInput = tr.querySelector('[data-med-field="name"]');
      const quantityInput = tr.querySelector('[data-med-field="quantity"]');
      const noteInput = tr.querySelector('[data-med-field="note"]');
      if (nameInput && quantityInput) {
        medicines.push({
          name: nameInput.value,
          quantity: quantityInput.value,
          note: noteInput ? noteInput.value : ''
        });
      }
    });
  }
  data.medicines = medicines;

  try {
    // 先获取当前记录
    const getRes = await _dependencies.homeFetch(`/api/admin/table/prescriptions/${rowId}`);
    if (getRes.code !== 0) throw new Error(getRes.message);
    
    const currentRecord = getRes.data;
    let currentData = {};
    try {
      currentData = typeof currentRecord.data === 'string' ? JSON.parse(currentRecord.data) : (currentRecord.data || {});
    } catch (e) {}

    // 合并数据
    const mergedData = { ...currentData, ...data };

    // 更新处方
    const updateData = {
      prescriptionId: data.prescriptionId || currentRecord.prescriptionId,
      data: JSON.stringify(mergedData)
    };

    const res = await _dependencies.homeFetch(`/api/admin/table/prescriptions/${rowId}`, {
      method: 'PUT',
      body: JSON.stringify(updateData)
    });
    
    if (res.code !== 0) throw new Error(res.message);
    _dependencies.showToast('保存成功', 'success');
    _dependencies.loadTableData();
  } catch (err) {
    _dependencies.showAlert('保存失败', err.message);
  }
}

/**
 * 添加药材
 * @param {number} rowId - 处方行ID
 */
export function addMedicine(rowId) {
  const tbody = document.getElementById(`medicines-body-${rowId}`);
  if (!tbody) return;
  
  const newIndex = tbody.children.length;
  const tr = document.createElement('tr');
  tr.setAttribute('data-med-index', newIndex);
  tr.innerHTML = `
    <td>${newIndex + 1}</td>
    <td><input class="med-input" data-med-field="name" data-med-index="${newIndex}" value="" /></td>
    <td><input class="med-input" data-med-field="quantity" data-med-index="${newIndex}" value="" /></td>
    <td><input class="med-input" data-med-field="note" data-med-index="${newIndex}" value="" /></td>
    <td><button class="action-btn action-btn-delete" onclick="window._prescriptionModule.removeMedicine(${rowId}, ${newIndex})">删除</button></td>
  `;
  tbody.appendChild(tr);
}

/**
 * 删除药材
 * @param {number} rowId - 处方行ID
 * @param {number} index - 药材索引
 */
export function removeMedicine(rowId, index) {
  const tbody = document.getElementById(`medicines-body-${rowId}`);
  if (!tbody) return;
  
  const row = tbody.querySelector(`tr[data-med-index="${index}"]`);
  if (row) {
    row.remove();
    // 重新编号
    Array.from(tbody.children).forEach((tr, i) => {
      tr.querySelector('td:first-child').textContent = i + 1;
    });
  }
}

// ==================== 处方删除验证 ====================

/**
 * 验证是否可以删除处方
 * @param {string} rowId - 处方行ID
 * @param {Object} row - 处方数据
 * @returns {Object} { canDelete: boolean, message?: string }
 */
export function validateDelete(rowId, row) {
  // 已结算处方禁止删除
  if (row && row.status === '已结算') {
    return {
      canDelete: false,
      message: '已结算处方不可删除'
    };
  }
  
  return { canDelete: true };
}

// ==================== 导出模块实例供全局访问 ====================
if (typeof window !== 'undefined') {
  window._prescriptionModule = {
    initPrescriptionModule,
    savePrescriptionDetail,
    addMedicine,
    removeMedicine,
    validateDelete
  };
}