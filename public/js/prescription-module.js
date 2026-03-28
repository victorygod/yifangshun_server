// ==================== 处方管理模块 ====================

/**
 * 依赖项（需要在使用前通过 initPrescriptionModule 设置）
 */
const _dependencies = {
  homeFetch: null,
  showToast: null,
  showAlert: null,
  loadTableData: null,
  showConfirm: null,
  showImagePreview: null,
  getTableData: null,
  getTableConfig: null
};

/**
 * HTML 转义函数
 * @param {string} text - 要转义的文本
 * @returns {string} 转义后的文本
 */
function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

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
    // 从 tableData 获取当前记录的处方ID和状态（不再调用旧API）
    const tableData = _dependencies.getTableData();
    const currentRecord = tableData.find(r => String(r.id) === String(rowId));

    if (!currentRecord) {
      throw new Error('找不到处方数据');
    }

    const prescriptionId = data.prescriptionId || currentRecord.prescriptionId;
    const status = currentRecord.status;

    // 调用新的更新API（注意：不要把 data 嵌套一层）
    const res = await _dependencies.homeFetch('/api/prescription/update', {
      method: 'POST',
      body: JSON.stringify({
        prescriptionId: prescriptionId,
        status: status,
        ...data  // 直接展开 data 中的字段
      })
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
    validateDelete,
    renderPrescriptionDetail,
    handlePrescriptionReview,
    savePrescription,
    deletePrescription
  };
}

// ==================== 渲染处方详情 ====================

/**
 * 渲染处方详情
 * @param {Object} row - 处方数据
 * @returns {string} HTML字符串
 */
export function renderPrescriptionDetail(row) {
  const config = _dependencies.getTableConfig();
  const columns = config.prescriptions.columns;
  let prescriptionData = {};

  // 解析 data 字段
  try {
    if (typeof row.data === 'string') {
      prescriptionData = JSON.parse(row.data);
    } else if (typeof row.data === 'object') {
      prescriptionData = row.data;
    }
  } catch (e) {
    console.error('解析处方数据失败:', e);
  }

  // 药材列表
  let medicines = prescriptionData.medicines || prescriptionData['药方'] || [];
  // 确保 medicines 是数组
  if (!Array.isArray(medicines)) {
    medicines = [];
  }
  const dosage = prescriptionData.dosage || prescriptionData['剂数'] || '';
  const name = prescriptionData.name || prescriptionData['姓名'] || '';
  const age = prescriptionData.age || prescriptionData['年龄'] || '';
  const date = prescriptionData.date || prescriptionData['日期'] || row.prescriptionDate || '';
  const doctor = prescriptionData.doctor || prescriptionData['医师'] || '';
  const administrationMethod = prescriptionData.administrationMethod || prescriptionData['服用方式'] || '';
  const rp = prescriptionData.rp || prescriptionData['Rp'] || '';
  
  // 已结算状态不可编辑
  const isSettled = row.status === '已结算';
  const disabledAttr = isSettled ? ' disabled' : '';

  let html = `<tr class="detail-row prescription-detail-row" data-parent-id="${row.id}">`;
  html += `<td colspan="${columns.length + 2}" class="detail-cell">`;
  html += `<div class="detail-content prescription-detail">`;

  // 缩略图
  if (row.thumbnail) {
    html += `<div class="prescription-thumbnail">`;
    html += `<img src="${row.thumbnail}" class="prescription-thumbnail-img" onclick="_dependencies.showImagePreview('${row.thumbnail}')" />`;
    html += `</div>`;
  }

  // 处方基本信息（可编辑）
  html += `<div class="prescription-info-grid">`;
  html += `<div class="info-item"><span class="info-label">处方号：</span><input class="info-input" data-field="prescriptionId" value="${escapeHtml(row.prescriptionId || '')}"${disabledAttr} /></div>`;
  html += `<div class="info-item"><span class="info-label">姓名：</span><input class="info-input" data-field="name" value="${escapeHtml(name)}"${disabledAttr} /></div>`;
  html += `<div class="info-item"><span class="info-label">年龄：</span><input class="info-input" data-field="age" value="${escapeHtml(String(age))}"${disabledAttr} /></div>`;
  html += `<div class="info-item"><span class="info-label">日期：</span><input class="info-input" data-field="date" value="${escapeHtml(date)}"${disabledAttr} /></div>`;
  html += `<div class="info-item"><span class="info-label">剂数：</span><input class="info-input" data-field="dosage" value="${escapeHtml(String(dosage))}"${disabledAttr} /></div>`;
  html += `<div class="info-item"><span class="info-label">服用方式：</span><input class="info-input" data-field="administrationMethod" value="${escapeHtml(administrationMethod)}"${disabledAttr} /></div>`;
  html += `<div class="info-item"><span class="info-label">医师：</span><input class="info-input" data-field="doctor" value="${escapeHtml(doctor)}"${disabledAttr} /></div>`;
  html += `<div class="info-item"><span class="info-label">状态：</span><span class="info-value">${row.status || '-'}</span></div>`;
  html += `<div class="info-item"><span class="info-label">审核人：</span><span class="info-value">${row.reviewer || '-'}</span></div>`;
  html += `</div>`;

  // Rp
  html += `<div class="prescription-rp-section">`;
  html += `<div class="info-label">Rp：</div>`;
  html += `<textarea class="info-textarea" data-field="rp"${disabledAttr}>${escapeHtml(rp)}</textarea>`;
  html += `</div>`;

  // 药材列表（可编辑）
  html += `<div class="medicines-section">`;
  html += `<div class="medicines-title">药方 (${medicines.length}味)</div>`;
  html += `<table class="medicines-table">`;
  html += `<thead><tr><th>序号</th><th>药名</th><th>剂量</th><th>备注</th>${!isSettled ? '<th>操作</th>' : ''}</tr></thead>`;
  html += `<tbody id="medicines-body-${row.id}">`;
  medicines.forEach((med, index) => {
    const medName = med.name || med['药名'] || '';
    const medQuantity = med.quantity || med['数量'] || '';
    const medNote = med.note || med['备注'] || '';
    html += `<tr data-med-index="${index}">
      <td>${index + 1}</td>
      <td><input class="med-input" data-med-field="name" data-med-index="${index}" value="${escapeHtml(medName)}"${disabledAttr} /></td>
      <td><input class="med-input" data-med-field="quantity" data-med-index="${index}" value="${escapeHtml(String(medQuantity))}"${disabledAttr} /></td>
      <td><input class="med-input" data-med-field="note" data-med-index="${index}" value="${escapeHtml(medNote)}"${disabledAttr} /></td>
      ${!isSettled ? `<td><button class="action-btn action-btn-delete" onclick="window._prescriptionModule.removeMedicine(${row.id}, ${index})">删除</button></td>` : ''}
    </tr>`;
  });
  html += `</tbody></table>`;
  
  // 添加药材按钮（待审核状态）
  if (!isSettled) {
    html += `<button class="action-btn" onclick="window._prescriptionModule.addMedicine(${row.id})">+ 添加药材</button>`;
  }
  
  html += `</div>`;

  // 保存按钮（待审核状态）
  if (!isSettled) {
    html += `<div class="prescription-actions">`;
    html += `<button class="btn btn-primary" onclick="window._prescriptionModule.savePrescriptionDetail(${row.id})">保存修改</button>`;
    html += `</div>`;
  }

  html += `</div></td></tr>`;
  return html;
}

// ==================== 处方审核 ====================

/**
 * 处理处方审核
 * @param {number} rowId - 处方行ID
 * @param {string} prescriptionId - 处方ID
 */
export async function handlePrescriptionReview(rowId, prescriptionId) {
  const tableData = _dependencies.getTableData();
  const row = tableData.find(r => String(r.id) === String(rowId));
  if (!row) {
    _dependencies.showToast('找不到处方数据', 'error');
    return;
  }

  _dependencies.showConfirm('审核处方', `确定要审核通过处方 ${prescriptionId} 吗？`, async () => {
    try {
      const res = await _dependencies.homeFetch('/api/prescription/review', {
        method: 'POST',
        body: JSON.stringify({
          prescriptionId: prescriptionId,
          status: '待审核',
          action: 'approve'
        })
      });

      if (res.code === 2) {
        // 有重复处方，需要确认
        _dependencies.showConfirm('重复处方', `处方ID "${prescriptionId}" 已存在，是否覆盖？`, async () => {
          try {
            const confirmRes = await _dependencies.homeFetch('/api/prescription/confirm-approve', {
              method: 'POST',
              body: JSON.stringify({
                prescriptionId: prescriptionId,
                status: '待审核'
              })
            });

            if (confirmRes.code !== 0) throw new Error(confirmRes.message);

            _dependencies.showToast('审核成功', 'success');
            _dependencies.loadTableData();
          } catch (err) {
            _dependencies.showToast('审核失败: ' + err.message, 'error');
          }
        });
      } else if (res.code !== 0) {
        throw new Error(res.message);
      }

      _dependencies.showToast('审核成功', 'success');
      _dependencies.loadTableData();
    } catch (err) {
      _dependencies.showToast('审核失败: ' + err.message, 'error');
    }
  });
}

// ==================== 处方保存 ====================

/**
 * 保存处方
 * @param {number} rowId - 处方行ID
 * @param {Object} data - 处方数据
 * @returns {Promise<Object>} 保存结果
 */
export async function savePrescription(rowId, data) {
  const tableData = _dependencies.getTableData();
  const rowData = tableData.find(r => String(r.id) === String(rowId));
  if (!rowData) {
    throw new Error('找不到处方数据');
  }

  // 处方需要使用复合主键，从 tableData 中获取 prescriptionId 和 status
  const prescriptionId = data.prescriptionId || rowData.prescriptionId;
  const status = rowData.status;

  // 处方数据需要转换为 data 字段
  const prescriptionData = {
    prescriptionId: data.prescriptionId,
    name: data.name,
    age: data.age,
    date: data.date,
    dosage: data.dosage,
    administrationMethod: data.administrationMethod,
    doctor: data.doctor,
    rp: data.rp,
    medicines: data.medicines
  };

  // 从 data 中删除处方相关字段
  delete data.prescriptionId;
  delete data.name;
  delete data.age;
  delete data.date;
  delete data.dosage;
  delete data.administrationMethod;
  delete data.doctor;
  delete data.rp;
  delete data.medicines;

  // 将处方数据放入 data 字段
  Object.assign(data, prescriptionData);

  const res = await _dependencies.homeFetch('/api/prescription/update', {
    method: 'POST',
    body: JSON.stringify({
      prescriptionId: prescriptionId,
      status: status,
      ...data
    })
  });

  if (res.code !== 0) throw new Error(res.message);
  return res;
}

// ==================== 处方删除 ====================

/**
 * 删除处方
 * @param {number} rowId - 处方行ID
 * @returns {Promise<Object>} 删除结果
 */
export async function deletePrescription(rowId) {
  const tableData = _dependencies.getTableData();
  const rowData = tableData.find(r => String(r.id) === String(rowId));
  if (!rowData) {
    throw new Error('找不到处方数据');
  }

  const deleteApi = `/api/prescription/${encodeURIComponent(rowData.prescriptionId)}/${encodeURIComponent(rowData.status)}`;
  const res = await _dependencies.homeFetch(deleteApi, { method: 'DELETE' });

  if (res.code !== 0) throw new Error(res.message);
  return res;
}