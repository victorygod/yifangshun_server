/**
 * 易方顺诊所助手 - 管理后台脚本
 */

// ==================== 配置 ====================

// 菜单配置
const menuConfig = [
  { id: 'dashboard', icon: '📊', label: '总览', type: 'page' },
  { id: 'users', icon: '👥', label: '用户管理', type: 'table', tableName: 'users' },
  { 
    id: 'stock', 
    icon: '📦', 
    label: '库存管理', 
    type: 'group',
    children: [
      { id: 'herbs', icon: '🌿', label: '药材信息', type: 'table', tableName: 'herbs' },
      { id: 'stock_in_orders', icon: '📥', label: '入库管理', type: 'table', tableName: 'stock_in_orders' },
      { id: 'stock_out_orders', icon: '📤', label: '执药管理', type: 'table', tableName: 'stock_out_orders' },
      { id: 'stock_inventory', icon: '📋', label: '库存统计', type: 'table', tableName: 'stock_inventory' },
      { id: 'stock_check_orders', icon: '🔢', label: '盘点管理', type: 'table', tableName: 'stock_check_orders' }
    ]
  },
  { 
    id: 'data', 
    icon: '🗄️', 
    label: '数据管理', 
    type: 'group',
    children: [
      { id: 'bookings', icon: '📅', label: '预约记录', type: 'table', tableName: 'bookings' },
      { id: 'prescriptions', icon: '💊', label: '处方记录', type: 'table', tableName: 'prescriptions' },
      { id: 'stock_in_items', icon: '📝', label: '入库明细', type: 'table', tableName: 'stock_in_items' },
      { id: 'stock_out_items', icon: '📝', label: '执药明细', type: 'table', tableName: 'stock_out_items' },
      { id: 'stock_check_items', icon: '📝', label: '盘点明细', type: 'table', tableName: 'stock_check_items' },
      { id: 'stock_logs', icon: '📜', label: '操作日志', type: 'table', tableName: 'stock_logs' }
    ]
  }
];

// 表配置
const tableConfigs = {
  users: {
    displayName: '用户管理',
    columns: [
      { key: 'openid', label: 'OpenID', readonly: true },
      { key: 'name', label: '姓名', editable: true },
      { key: 'phone', label: '手机号', editable: true },
      { key: 'role', label: '角色', type: 'select', options: [
        { value: 'user', label: '普通用户', badge: 'badge-user' },
        { value: 'admin', label: '管理员', badge: 'badge-admin' },
        { value: 'super_admin', label: '超级管理员', badge: 'badge-super_admin' }
      ]},
      { key: 'createdAt', label: '创建时间', readonly: true, type: 'datetime' }
    ],
    searchFields: ['name', 'phone', 'openid']
  },
  bookings: {
    displayName: '预约记录',
    columns: [
      { key: 'id', label: 'ID', readonly: true },
      { key: 'openid', label: 'OpenID', readonly: true },
      { key: 'date', label: '预约日期', editable: true },
      { key: 'status', label: '状态', type: 'select', options: [
        { value: 'active', label: '有效', badge: 'badge-active' },
        { value: 'cancelled', label: '已取消', badge: 'badge-cancelled' }
      ]},
      { key: 'createdAt', label: '创建时间', readonly: true, type: 'datetime' }
    ],
    searchFields: ['openid', 'date']
  },
  prescriptions: {
    displayName: '处方记录',
    columns: [
      { key: 'id', label: 'ID', readonly: true },
      { key: 'prescriptionId', label: '处方号', editable: true },
      { key: 'name', label: '患者姓名', editable: true },
      { key: 'openid', label: 'OpenID', readonly: true },
      { key: 'status', label: '状态', type: 'select', options: [
        { value: 'pending', label: '待审核', badge: 'badge-pending' },
        { value: 'reviewed', label: '已审核', badge: 'badge-reviewed' },
        { value: 'rejected', label: '已拒绝', badge: 'badge-rejected' }
      ]},
      { key: 'createdAt', label: '创建时间', readonly: true, type: 'datetime' }
    ],
    searchFields: ['prescriptionId', 'name', 'openid']
  },
  herbs: {
    displayName: '药材信息',
    columns: [
      { key: 'id', label: 'ID', readonly: true },
      { key: 'name', label: '药材名称', editable: true, required: true },
      { key: 'alias', label: '别名', editable: true },
      { key: 'cabinetNo', label: '柜号', editable: true },
      { key: 'salePrice', label: '售卖单价', editable: true, type: 'number' },
      { key: 'stock', label: '现有库存', readonly: true, type: 'number' },
      { key: 'minValue', label: '最低库存', editable: true, type: 'number' },
      { key: 'remark', label: '备注', editable: true }
    ],
    searchFields: ['name', 'alias', 'cabinetNo']
  },
  stock_in_orders: {
    displayName: '入库管理',
    columns: [
      { key: 'id', label: 'ID', readonly: true },
      { key: 'orderDate', label: '入库日期', editable: true, type: 'date' },
      { key: 'supplier', label: '供应商', editable: true },
      { key: 'phone', label: '电话', editable: true },
      { key: 'totalAmount', label: '总价', readonly: true, type: 'number' },
      { key: 'status', label: '状态', type: 'select', options: [
        { value: 'draft', label: '草稿', badge: 'badge-draft' },
        { value: 'stocked', label: '已入库', badge: 'badge-stocked' }
      ]}
    ],
    searchFields: ['supplier'],
    hasDetail: true,
    detailTable: 'stock_in_items'
  },
  stock_out_orders: {
    displayName: '执药单管理',
    columns: [
      { key: 'id', label: 'ID', readonly: true },
      { key: 'prescriptionTime', label: '处方更新时间', readonly: true, type: 'datetime' },
      { key: 'prescriptionId', label: '处方ID', readonly: true },
      { key: 'pharmacist', label: '药师', editable: true },
      { key: 'reviewer', label: '审核人', editable: true },
      { key: 'status', label: '状态', type: 'select', options: [
        { value: 'pending', label: '待执药', badge: 'badge-pending' },
        { value: 'settled', label: '已结算', badge: 'badge-stocked' }
      ]},
      { key: 'totalAmount', label: '总价', readonly: true, type: 'number' },
      { key: 'remark', label: '备注', editable: true }
    ],
    searchFields: ['prescriptionId', 'pharmacist'],
    hasDetail: true,
    detailTable: 'stock_out_items'
  },
  stock_inventory: {
    displayName: '库存统计',
    columns: [
      { key: 'id', label: 'ID', readonly: true },
      { key: 'herbName', label: '药材名称', editable: true },
      { key: 'herbAlias', label: '别名', editable: true },
      { key: 'quantity', label: '库存数量', editable: true, type: 'number' },
      { key: 'avgPrice', label: '均价', editable: true, type: 'number' },
      { key: 'minValue', label: '最低库存', editable: true, type: 'number' },
      { key: 'updatedAt', label: '更新时间', readonly: true, type: 'datetime' }
    ],
    searchFields: ['herbName', 'herbAlias']
  },
  stock_check_orders: {
    displayName: '盘点管理',
    columns: [
      { key: 'id', label: 'ID', readonly: true },
      { key: 'checkNo', label: '盘点单号', readonly: true },
      { key: 'checkDate', label: '盘点日期', editable: true, type: 'date' },
      { key: 'checker', label: '盘点人', editable: true },
      { key: 'status', label: '状态', type: 'select', options: [
        { value: 'draft', label: '草稿', badge: 'badge-draft' },
        { value: 'confirmed', label: '已确认', badge: 'badge-stocked' }
      ]}
    ],
    searchFields: ['checkNo', 'checker']
  },
  stock_in_items: {
    displayName: '入库明细',
    columns: [
      { key: 'id', label: 'ID', readonly: true },
      { key: 'orderId', label: '入库单ID', readonly: true },
      { key: 'herbName', label: '药材名称', editable: true },
      { key: 'supplierName', label: '供方品名', editable: true },
      { key: 'quantity', label: '克数', editable: true, type: 'number' },
      { key: 'unitPrice', label: '进货单价', editable: true, type: 'number' },
      { key: 'totalPrice', label: '总价', editable: true, type: 'number' }
    ],
    searchFields: ['herbName', 'supplierName']
  },
  stock_out_items: {
    displayName: '执药明细',
    columns: [
      { key: 'id', label: 'ID', readonly: true },
      { key: 'orderId', label: '执药单ID', readonly: true },
      { key: 'herbName', label: '药材名称', editable: true },
      { key: 'quantity', label: '克数', editable: true, type: 'number' },
      { key: 'unitPrice', label: '单价', readonly: true, type: 'number' },
      { key: 'totalPrice', label: '本药总价', editable: true, type: 'number' }
    ],
    searchFields: ['herbName']
  },
  stock_check_items: {
    displayName: '盘点明细',
    columns: [
      { key: 'id', label: 'ID', readonly: true },
      { key: 'checkId', label: '盘点单ID', readonly: true },
      { key: 'herbName', label: '药材名称', editable: true },
      { key: 'systemQuantity', label: '系统库存', editable: true, type: 'number' },
      { key: 'actualQuantity', label: '实际库存', editable: true, type: 'number' },
      { key: 'difference', label: '差异', readonly: true, type: 'number' }
    ],
    searchFields: ['herbName']
  },
  stock_logs: {
    displayName: '操作日志',
    columns: [
      { key: 'id', label: 'ID', readonly: true },
      { key: 'action', label: '操作类型', readonly: true },
      { key: 'orderNo', label: '关联单号', readonly: true },
      { key: 'herbName', label: '药材', readonly: true },
      { key: 'quantity', label: '数量', readonly: true, type: 'number' },
      { key: 'createdAt', label: '操作时间', readonly: true, type: 'datetime' }
    ],
    readonly: true
  }
};

// ==================== 状态 ====================

let currentTable = null;
let currentPage = 1;
let pageSize = 20;
let selectedIds = [];
let editingRowId = null;
let searchKeyword = '';
let expandedRows = new Set(); // 展开的行ID集合

// ==================== 初始化 ====================

document.addEventListener('DOMContentLoaded', async () => {
  renderSidebar();
  await loadStats();
  switchPage('dashboard');
});

// ==================== API 请求 ====================

async function homeFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-home-page': 'true',
      ...options.headers
    }
  });
  return res.json();
}

// ==================== 侧边栏 ====================

function renderSidebar() {
  const sidebar = document.getElementById('sidebar');
  sidebar.innerHTML = menuConfig.map(item => {
    if (item.type === 'page') {
      return `<div class="menu-item" data-id="${item.id}" onclick="switchPage('${item.id}')">${item.icon} ${item.label}</div>`;
    } else if (item.type === 'group') {
      return `
        <div class="menu-group" data-group="${item.id}">
          <div class="menu-group-header" onclick="toggleGroup('${item.id}')">
            <span>${item.icon} ${item.label}</span>
            <span class="arrow">▼</span>
          </div>
          <div class="menu-items">
            ${item.children.map(child => `
              <div class="menu-item" data-id="${child.id}" data-table="${child.tableName}" onclick="switchPage('${child.id}')">${child.icon} ${child.label}</div>
            `).join('')}
          </div>
        </div>
      `;
    } else if (item.type === 'table') {
      return `<div class="menu-item" data-id="${item.id}" data-table="${item.tableName}" onclick="switchPage('${item.id}')">${item.icon} ${item.label}</div>`;
    }
  }).join('');
}

function toggleGroup(groupId) {
  const group = document.querySelector(`[data-group="${groupId}"]`);
  group.classList.toggle('collapsed');
}

function setActiveMenu(id) {
  document.querySelectorAll('.menu-item').forEach(item => item.classList.remove('active'));
  const item = document.querySelector(`.menu-item[data-id="${id}"]`);
  if (item) item.classList.add('active');
}

// ==================== 页面切换 ====================

async function switchPage(id) {
  // 完全重置所有状态
  selectedIds = [];
  editingRowId = null;
  searchKeyword = '';
  currentPage = 1;
  
  setActiveMenu(id);
  
  if (id === 'dashboard') {
    renderDashboard();
  } else {
    const menuItem = findMenuItem(id);
    if (menuItem && menuItem.tableName) {
      currentTable = menuItem.tableName;
      await renderTablePage();
    }
  }
}

function findMenuItem(id) {
  for (const item of menuConfig) {
    if (item.id === id) return item;
    if (item.children) {
      const found = item.children.find(child => child.id === id);
      if (found) return found;
    }
  }
  return null;
}

// ==================== 总览页面 ====================

async function renderDashboard() {
  const main = document.getElementById('main');
  main.innerHTML = `<div class="loading">加载中...</div>`;
  
  try {
    const res = await homeFetch('/api/admin/tables');
    if (res.code !== 0) throw new Error(res.message);
    
    const tables = res.data;
    
    main.innerHTML = `
      <div class="page-header">
        <div class="page-title">📊 总览</div>
      </div>
      <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px;">
        ${tables.filter(t => t.exists).map(t => `
          <div style="background: white; padding: 16px; border-radius: 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.08);">
            <div style="font-size: 13px; color: #999; margin-bottom: 6px;">${t.displayName}</div>
            <div style="font-size: 24px; font-weight: 600; color: #333;">${t.count}</div>
          </div>
        `).join('')}
      </div>
    `;
  } catch (err) {
    main.innerHTML = `<div class="empty-state"><div class="empty-icon">❌</div><p>${err.message}</p></div>`;
  }
}

// ==================== 表格页面 ====================

async function renderTablePage() {
  const config = tableConfigs[currentTable];
  if (!config) {
    document.getElementById('main').innerHTML = `<div class="empty-state"><p>表配置不存在</p></div>`;
    return;
  }
  
  const main = document.getElementById('main');
  main.innerHTML = `
    <div class="page-header">
      <div class="page-title">${config.displayName}</div>
      <div class="page-actions">
        <button class="btn btn-primary" id="addNewBtn">+ 新增记录</button>
      </div>
    </div>
    <div class="table-container">
      <div class="table-toolbar">
        <div class="toolbar-left">
          <input type="text" class="search-input" placeholder="搜索..." id="searchInput" value="${searchKeyword}">
          <button class="btn btn-danger" id="batchDeleteBtn" disabled>🗑️ 批量删除</button>
        </div>
        <div class="selected-count" id="selectedCount"></div>
      </div>
      <div id="tableBody">
        <div class="loading">加载中...</div>
      </div>
    </div>
  `;
  
  // 绑定按钮事件
  document.getElementById('addNewBtn').addEventListener('click', addNewRow);
  document.getElementById('batchDeleteBtn').addEventListener('click', batchDelete);
  document.getElementById('searchInput').addEventListener('keyup', handleSearch);
  
  await loadTableData();
}

async function loadTableData() {
  const config = tableConfigs[currentTable];
  const tableBody = document.getElementById('tableBody');
  
  try {
    let rows, pagination;
    
    // 入库单和执药单使用专用API（包含明细）
    if (currentTable === 'stock_in_orders') {
      const res = await homeFetch(`/api/stock/in/orders?page=${currentPage}&pageSize=${pageSize}`);
      if (res.code !== 0) throw new Error(res.message);
      rows = res.data || [];
      pagination = res.pagination || { page: 1, pageSize: 20, totalCount: rows.length, totalPages: 1 };
    } else if (currentTable === 'stock_out_orders') {
      const res = await homeFetch(`/api/stock/out/orders?page=${currentPage}&pageSize=${pageSize}`);
      if (res.code !== 0) throw new Error(res.message);
      rows = res.data || [];
      pagination = res.pagination || { page: 1, pageSize: 20, totalCount: rows.length, totalPages: 1 };
    } else {
      const url = `/api/admin/table/${currentTable}?page=${currentPage}&pageSize=${pageSize}&keyword=${encodeURIComponent(searchKeyword)}`;
      const res = await homeFetch(url);
      if (res.code !== 0) throw new Error(res.message);
      rows = res.data.rows;
      pagination = res.data.pagination;
    }
    
    const columns = config.columns;
    
    if (rows.length === 0 && editingRowId !== 'new') {
      tableBody.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📋</div>
          <p>${searchKeyword ? '未找到匹配的记录' : '暂无数据'}</p>
        </div>
      `;
      return;
    }
    
    const hasDetail = config.hasDetail;
    const detailTable = config.detailTable;
    
    let html = `
      <div class="table-wrapper">
        <table class="data-table">
          <thead>
            <tr>
              <th class="col-checkbox">
                <input type="checkbox" class="checkbox" id="selectAll" onchange="toggleSelectAll(this.checked)">
              </th>
              ${hasDetail ? '<th class="col-expand"></th>' : ''}
              ${columns.map(col => `<th>${col.label}</th>`).join('')}
              <th class="col-action">操作</th>
            </tr>
          </thead>
          <tbody>
    `;
    
    rows.forEach((row, rowIndex) => {
      const isEditing = String(editingRowId) === String(row.id);
      const isExpanded = expandedRows.has(String(row.id));
      
      // 主行
      html += `<tr data-id="${row.id}" class="${isEditing ? 'editing' : ''}">`;
      html += `<td class="col-checkbox">
        <input type="checkbox" class="checkbox row-checkbox" data-id="${row.id}" 
          ${selectedIds.includes(row.id) ? 'checked' : ''} 
          onchange="toggleSelect('${row.id}')">
      </td>`;
      
      // 展开按钮
      if (hasDetail) {
        html += `<td class="col-expand">
          <button class="expand-btn ${isExpanded ? 'expanded' : ''}" data-action="toggleDetail" data-id="${row.id}">
            ${isExpanded ? '▼' : '▶'}
          </button>
        </td>`;
      }
      
      columns.forEach(col => {
        const value = row[col.key] ?? '';
        const isReadonly = config.readonly || col.readonly;
        
        if (isEditing && !isReadonly) {
          if (col.type === 'select') {
            html += `<td>
              <select class="cell-select" data-col="${col.key}">
                ${col.options.map(opt => `<option value="${opt.value}" ${value === opt.value ? 'selected' : ''}>${opt.label}</option>`).join('')}
              </select>
            </td>`;
          } else {
            html += `<td><input type="${col.type === 'number' ? 'number' : 'text'}" class="cell-input" data-col="${col.key}" value="${escapeHtml(value)}"></td>`;
          }
        } else {
          let displayValue = value;
          if (col.type === 'datetime' && value) {
            displayValue = new Date(value).toLocaleString('zh-CN');
          } else if (col.type === 'select' && col.options) {
            const opt = col.options.find(o => o.value === value);
            displayValue = opt ? (opt.badge ? `<span class="badge ${opt.badge}">${opt.label}</span>` : opt.label) : value;
          }
          
          // 长文本处理
          const cellClass = isReadonly ? 'cell-readonly' : 'cell-editable';
          const isLongText = col.key === 'openid' || col.key === 'orderNo' || col.key === 'checkNo';
          
          // 点击单元格进入编辑模式
          html += `<td class="${isReadonly ? '' : 'cell-clickable'}" data-row-id="${row.id}" data-col-key="${col.key}">
            <span class="${cellClass} ${isLongText ? 'cell-long' : ''}" title="${escapeHtml(String(value))}">${displayValue || '-'}</span>
          </td>`;
        }
      });
      
      html += `<td class="col-action">`;
      if (isEditing) {
        html += `
          <button class="action-btn action-btn-save" data-action="save" data-id="${row.id}">保存</button>
          <button class="action-btn action-btn-cancel" data-action="cancel">取消</button>
        `;
      } else {
        html += `
          <button class="action-btn action-btn-delete" data-action="delete" data-id="${row.id}">删除</button>
        `;
      }
      html += `</td></tr>`;
      
      // 详情行
      if (hasDetail && isExpanded && row.items && row.items.length > 0) {
        const detailConfig = tableConfigs[detailTable];
        const detailColumns = detailConfig ? detailConfig.columns : [];
        
        html += `<tr class="detail-row" data-parent-id="${row.id}">`;
        html += `<td colspan="${columns.length + 3}" class="detail-cell">`;
        html += `<div class="detail-content">`;
        html += `<div class="detail-header">明细信息</div>`;
        html += `<table class="detail-table">`;
        html += `<thead><tr>${detailColumns.map(col => `<th>${col.label}</th>`).join('')}<th class="col-action">操作</th></tr></thead>`;
        html += `<tbody>`;
        
        row.items.forEach(item => {
          html += `<tr data-detail-id="${item.id}">`;
          detailColumns.forEach(col => {
            const value = item[col.key] ?? '';
            const isReadonly = col.readonly;
            if (isReadonly) {
              html += `<td><span class="cell-readonly">${value || '-'}</span></td>`;
            } else {
              html += `<td><input type="${col.type === 'number' ? 'number' : 'text'}" class="detail-input" data-col="${col.key}" value="${escapeHtml(String(value))}"></td>`;
            }
          });
          html += `<td class="col-action">
            <button class="action-btn action-btn-delete" data-action="deleteDetail" data-id="${item.id}" data-order-id="${row.id}">删除</button>
          </td>`;
          html += `</tr>`;
        });
        
        html += `</tbody></table>`;
        html += `<button class="btn btn-sm" data-action="addDetailItem" data-order-id="${row.id}">+ 添加明细</button>`;
        html += `</div></td></tr>`;
      }
    });
    
    // 新增行
    if (editingRowId === 'new') {
      html += `<tr class="editing" data-id="new">`;
      html += `<td class="col-checkbox"><input type="checkbox" class="checkbox" disabled></td>`;
      if (hasDetail) {
        html += `<td class="col-expand"></td>`;
      }
      columns.forEach(col => {
        const isReadonly = config.readonly || col.readonly;
        if (isReadonly) {
          html += `<td><span class="cell-readonly">自动</span></td>`;
        } else if (col.type === 'select') {
          html += `<td>
            <select class="cell-select" data-col="${col.key}">
              ${col.options.map(opt => `<option value="${opt.value}">${opt.label}</option>`).join('')}
            </select>
          </td>`;
        } else {
          html += `<td><input type="${col.type === 'number' ? 'number' : 'text'}" class="cell-input" data-col="${col.key}" placeholder="${col.label}"></td>`;
        }
      });
      html += `<td class="col-action">
        <button class="action-btn action-btn-save" data-action="saveNew">保存</button>
        <button class="action-btn action-btn-cancel" data-action="cancel">取消</button>
      </td></tr>`;
    }
    
    html += `</tbody></table></div>`;
    
    html += `
      <div class="pagination">
        <div class="pagination-info">第 ${pagination.page} / ${pagination.totalPages} 页，共 ${pagination.totalCount} 条</div>
        <div class="pagination-btns">
          <button class="page-btn" data-action="prevPage" data-page="${pagination.page - 1}" ${pagination.page <= 1 ? 'disabled' : ''}>上一页</button>
          <button class="page-btn" data-action="nextPage" data-page="${pagination.page + 1}" ${pagination.page >= pagination.totalPages ? 'disabled' : ''}>下一页</button>
        </div>
      </div>
    `;
    
    tableBody.innerHTML = html;
    
    // 使用事件委托绑定表格内所有点击事件
    tableBody.onclick = function(e) {
      // 按钮点击
      const btn = e.target.closest('[data-action]');
      if (btn) {
        const action = btn.dataset.action;
        const id = btn.dataset.id;
        const orderId = btn.dataset.orderId;
        
        switch(action) {
          case 'save':
            saveRow(id);
            return;
          case 'delete':
            deleteRow(id);
            return;
          case 'cancel':
            cancelEdit();
            return;
          case 'saveNew':
            saveNewRow();
            return;
          case 'prevPage':
          case 'nextPage':
            goToPage(parseInt(btn.dataset.page));
            return;
          case 'toggleDetail':
            toggleDetail(id);
            return;
          case 'addDetailItem':
            addDetailItem(orderId);
            return;
          case 'deleteDetail':
            deleteDetailItem(id, orderId);
            return;
        }
      }
      
      // 单元格点击进入编辑模式
      const cell = e.target.closest('.cell-clickable');
      if (cell && editingRowId !== 'new') {
        const rowId = cell.dataset.rowId;
        if (String(editingRowId) !== String(rowId)) {
          startEdit(rowId);
        }
      }
    };
    
    updateSelectedCount();
    
  } catch (err) {
    tableBody.innerHTML = `<div class="empty-state"><div class="empty-icon">❌</div><p>${err.message}</p></div>`;
  }
}

// ==================== 展开详情操作 ====================

function toggleDetail(rowId) {
  const idStr = String(rowId);
  if (expandedRows.has(idStr)) {
    expandedRows.delete(idStr);
  } else {
    expandedRows.add(idStr);
  }
  loadTableData();
}

async function addDetailItem(orderId) {
  // 添加空的明细项到列表中，等待保存
  showToast('请先保存主表，再添加明细', 'warning');
}

async function deleteDetailItem(itemId, orderId) {
  try {
    const res = await homeFetch(`/api/admin/table/${tableConfigs[currentTable].detailTable}/${itemId}`, {
      method: 'DELETE'
    });
    if (res.code !== 0) throw new Error(res.message);
    showToast('删除成功');
    loadTableData();
  } catch (err) {
    showToast('删除失败: ' + err.message, 'error');
  }
}

// ==================== 编辑操作 ====================

function startEdit(rowId) {
  // 统一转换为字符串比较
  editingRowId = String(rowId);
  loadTableData();
}

function cancelEdit() {
  editingRowId = null;
  selectedIds = [];
  loadTableData();
}

function addNewRow() {
  // 强制重置编辑状态，确保可以新增
  if (editingRowId === 'new') {
    // 已经在新增模式，直接返回
    return;
  }
  editingRowId = 'new';
  selectedIds = [];
  loadTableData();
}

async function saveRow(rowId) {
  const row = document.querySelector(`tr[data-id="${rowId}"]`);
  if (!row) {
    showToast('找不到编辑行', 'error');
    editingRowId = null;
    loadTableData();
    return;
  }
  
  const inputs = row.querySelectorAll('.cell-input, .cell-select');
  
  const data = {};
  inputs.forEach(input => {
    data[input.dataset.col] = input.value;
  });
  
  try {
    const res = await homeFetch(`/api/admin/table/${currentTable}/${rowId}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
    
    if (res.code !== 0) throw new Error(res.message);
    
    showToast('保存成功', 'success');
    editingRowId = null;
    selectedIds = [];
    loadTableData();
    loadStats();
  } catch (err) {
    showToast('保存失败: ' + err.message, 'error');
  }
}

async function saveNewRow() {
  const row = document.querySelector('tr[data-id="new"]');
  if (!row) {
    showToast('找不到新增行', 'error');
    editingRowId = null;
    loadTableData();
    return;
  }
  
  const inputs = row.querySelectorAll('.cell-input, .cell-select');
  
  const data = {};
  inputs.forEach(input => {
    if (input.value.trim()) {
      data[input.dataset.col] = input.value.trim();
    }
  });
  
  if (Object.keys(data).length === 0) {
    showToast('请至少填写一个字段', 'error');
    return;
  }
  
  try {
    const res = await homeFetch(`/api/admin/table/${currentTable}`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
    
    if (res.code !== 0) throw new Error(res.message);
    
    showToast('新增成功', 'success');
    editingRowId = null;
    selectedIds = [];
    loadTableData();
    loadStats();
  } catch (err) {
    showToast('新增失败: ' + err.message, 'error');
    // 保存失败时保持编辑状态，让用户可以修改后重试
  }
}

async function deleteRow(rowId) {
  showConfirm('确认删除', '确定要删除这条记录吗？', async () => {
    try {
      const res = await homeFetch(`/api/admin/table/${currentTable}/${rowId}`, { method: 'DELETE' });
      if (res.code !== 0) throw new Error(res.message);
      
      showToast('删除成功', 'success');
      loadTableData();
      loadStats();
    } catch (err) {
      showToast('删除失败: ' + err.message, 'error');
    }
  });
}

// ==================== 多选与批量删除 ====================

function toggleSelectAll(checked) {
  const checkboxes = document.querySelectorAll('.row-checkbox:not(:disabled)');
  if (checked) {
    selectedIds = Array.from(checkboxes).map(cb => cb.dataset.id);
  } else {
    selectedIds = [];
  }
  checkboxes.forEach(cb => cb.checked = checked);
  updateSelectedCount();
}

function toggleSelect(id) {
  const idx = selectedIds.indexOf(id);
  if (idx > -1) {
    selectedIds.splice(idx, 1);
  } else {
    selectedIds.push(id);
  }
  const allCheckbox = document.getElementById('selectAll');
  if (allCheckbox) {
    allCheckbox.checked = selectedIds.length === document.querySelectorAll('.row-checkbox:not(:disabled)').length;
  }
  updateSelectedCount();
}

function updateSelectedCount() {
  const countEl = document.getElementById('selectedCount');
  const btn = document.getElementById('batchDeleteBtn');
  if (!countEl || !btn) return;
  
  if (selectedIds.length > 0) {
    countEl.innerHTML = `已选择 <span>${selectedIds.length}</span> 条`;
    btn.disabled = false;
  } else {
    countEl.innerHTML = '';
    btn.disabled = true;
  }
}

async function batchDelete() {
  if (selectedIds.length === 0) return;
  
  showConfirm('批量删除', `确定要删除选中的 ${selectedIds.length} 条记录吗？`, async () => {
    try {
      const res = await homeFetch(`/api/admin/table/${currentTable}/batch-delete`, {
        method: 'POST',
        body: JSON.stringify({ ids: selectedIds })
      });
      
      if (res.code !== 0) throw new Error(res.message);
      
      showToast(`成功删除 ${res.data.deletedCount} 条记录`, 'success');
      selectedIds = [];
      loadTableData();
      loadStats();
    } catch (err) {
      showToast('批量删除失败: ' + err.message, 'error');
    }
  });
}

// ==================== 分页与搜索 ====================

function goToPage(page) {
  currentPage = page;
  editingRowId = null;
  selectedIds = [];
  loadTableData();
}

function handleSearch(e) {
  if (e.key === 'Enter') {
    searchKeyword = e.target.value.trim();
    currentPage = 1;
    loadTableData();
  }
}

// ==================== 统计信息 ====================

async function loadStats() {
  try {
    const res = await homeFetch('/api/admin/tables');
    if (res.code !== 0) return;
    
    const tables = res.data;
    const userTable = tables.find(t => t.name === 'users');
    const userCount = userTable ? userTable.count : 0;
    
    document.getElementById('headerStats').textContent = `已绑定用户: ${userCount}`;
  } catch (err) {
    console.error('加载统计失败:', err);
  }
}

// ==================== 工具函数 ====================

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function showToast(message, type = 'info') {
  const statusBar = document.getElementById('statusBar');
  if (statusBar) {
    statusBar.textContent = message;
    statusBar.className = 'status-bar ' + type;
    // 清除之前的定时器
    if (statusBar.hideTimer) clearTimeout(statusBar.hideTimer);
    // 3秒后清除
    statusBar.hideTimer = setTimeout(() => {
      statusBar.textContent = '';
      statusBar.className = 'status-bar';
    }, 3000);
  }
}

function showConfirm(title, message, onConfirm) {
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMessage').textContent = message;
  document.getElementById('confirmBtn').onclick = () => {
    closeConfirm();
    onConfirm();
  };
  document.getElementById('confirmModal').classList.add('show');
}

function closeConfirm() {
  document.getElementById('confirmModal').classList.remove('show');
}
