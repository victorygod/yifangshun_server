/**
 * 易方顺诊所助手 - 管理后台脚本
 */

// ==================== 全局开关 ====================

// 新旧实现切换开关
// false: 使用现有 if-else 逻辑
// true: 使用 tableHandlers 配置驱动的新架构
const USE_NEW_MODULES = true;

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
      { id: 'stock_out_orders', icon: '📤', label: '执药管理', type: 'table', tableName: 'stock_out_orders' }
    ]
  },
  { id: 'schedule', icon: '🗓️', label: '出诊管理', type: 'page' },
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
      { id: 'stock_logs', icon: '📜', label: '操作日志', type: 'table', tableName: 'stock_logs' }
    ]
  }
];

// ==================== 事件处理器配置 ====================

/**
 * 表格事件处理器配置
 * 每个表需要配置 onSave、onDelete、onToggleDetail、onPrevPage、onNextPage、onCancel 等通用操作
 * 以及各表特有的操作（如入库单的 onConfirmStockIn、执药单的 onSettleOrder 等）
 */
// ==================== 事件处理器配置 ====================

/**
 * 表格事件处理器配置
 * key 直接对应按钮的 data-action 值映射，如 save -> onSave
 * 值是 lambda 函数，参数在调用时传入
 */
const tableHandlers = {
  stock_in_orders: {
    // 入库单特有操作
    onConfirmStockIn: (id) => window._stockModule.confirmStockIn(id),
    onRevertToDraft: (id) => window._stockModule.revertToDraft(id),
    onZoomDetail: (orderId) => window._stockModule.showZoomDetail(orderId),
    onExportDetail: (orderId) => window._importExportModule.exportOrderDetail(orderId),
    onSaveDetail: (id, orderId) => {
      const row = document.querySelector(`tr[data-detail-id="${id}"]`);
      if (row) window._stockModule.saveDetailEdit(id, orderId, row);
    },
    onDeleteDetail: (id, orderId) => window._stockModule.removeDetailRow(id, orderId),
    onSaveDetailNew: (orderId) => {
      const row = document.querySelector(`tr.detail-new-row[data-order-id="${orderId}"]`);
      if (row) window._stockModule.saveDetailNewAuto(row);
    },
    // 通用操作
    onSaveNew: () => saveNewRow(),
    onSave: (id) => saveRow(id),
    onDelete: (id) => deleteRow(id),
    onToggleDetail: (id) => window._tableUtil.toggleDetail(id),
    onPrevPage: (page) => window._tableUtil.goToPage(page),
    onNextPage: (page) => window._tableUtil.goToPage(page),
    onCancel: () => window._tableUtil.cancelEdit(),
    onLoad: async (page, pageSize, keyword) => {
      // 入库单不需要预加载药材信息，失焦时会单独查询
      const config = tableConfigs[currentTable];
      const searchFieldsParam = config.searchFields ? `&searchFields=${config.searchFields.join(',')}` : '';
      const res = await homeFetch(`/api/stock/in/orders?page=${page}&pageSize=${pageSize}&keyword=${encodeURIComponent(keyword)}${searchFieldsParam}`);
      if (res.code !== 0) throw new Error(res.message);
      const rows = res.data?.rows || [];
      return {
        data: rows,
        pagination: res.data?.pagination || { page: 1, pageSize: 20, totalCount: rows.length, totalPages: 1 }
      };
    }
  },
  stock_out_orders: {
    onSettleOrder: (orderId) => window._stockModule.settleOutOrder(orderId),
    onRevokeOrder: (orderId) => window._stockModule.revokeSettledOrder(orderId),
    onZoomDetail: (orderId) => window._stockModule.showZoomDetail(orderId),
    onExportDetail: (orderId) => window._importExportModule.exportOrderDetail(orderId),
    onSaveDetail: (id, orderId) => {
      const editRow = document.querySelector(`tr[data-detail-id="${id}"]`);
      if (editRow) window._stockModule.saveDetailEdit(id, orderId, editRow);
    },
    onDeleteDetail: (id, orderId) => window._stockModule.removeDetailRow(id, orderId),
    onSaveDetailNew: (orderId) => {
      const newRow = document.querySelector(`tr.detail-new-row[data-order-id="${orderId}"]`);
      if (newRow) window._stockModule.saveDetailNewAuto(newRow);
    },
    onSaveNew: () => saveNewRow(),
    onSave: (id) => saveRow(id),
    onDelete: (id) => deleteRow(id),
    onToggleDetail: (id) => window._tableUtil.toggleDetail(id),
    onPrevPage: (page) => window._tableUtil.goToPage(page),
    onNextPage: (page) => window._tableUtil.goToPage(page),
    onCancel: () => window._tableUtil.cancelEdit(),
    onLoad: async (page, pageSize, keyword) => {
      const config = tableConfigs[currentTable];
      const searchFieldsParam = config.searchFields ? `&searchFields=${config.searchFields.join(',')}` : '';
      const res = await homeFetch(`/api/stock/out/orders?page=${page}&pageSize=${pageSize}&keyword=${encodeURIComponent(keyword)}${searchFieldsParam}`);
      if (res.code !== 0) throw new Error(res.message);
      const rows = res.data?.rows || [];
      return {
        data: rows,
        pagination: res.data?.pagination || { page: 1, pageSize: 20, totalCount: rows.length, totalPages: 1 }
      };
    }
  },
  prescriptions: {
    onReviewPrescription: (id, prescriptionId) => window._prescriptionModule.handlePrescriptionReview(id, prescriptionId),
    onSaveNew: () => saveNewRow(),
    onSave: (id) => saveRow(id),
    onDelete: (id) => deleteRow(id),
    onToggleDetail: (id) => window._tableUtil.toggleDetail(id),
    onPrevPage: (page) => window._tableUtil.goToPage(page),
    onNextPage: (page) => window._tableUtil.goToPage(page),
    onCancel: () => window._tableUtil.cancelEdit(),
    onLoad: async (page, pageSize, keyword) => {
      const res = await homeFetch(`/api/prescription/list?page=${page}&pageSize=${pageSize}&keyword=${encodeURIComponent(keyword)}`);
      if (res.code !== 0) throw new Error(res.message);
      return {
        data: res.data?.rows || [],
        pagination: res.data?.pagination || {}
      };
    }
  },
  herbs: {
    // 使用 herbs-module 的 handlers
    onSaveNew: () => saveNewRow(),
    onSave: (id) => {
      const row = window._tableUtil.getRowElement(id);
      if (row) window._herbsModule.herbsHandlers.onSave(id, row);
    },
    onDelete: (id) => window._herbsModule.herbsHandlers.onDelete(id),
    onToggleDetail: (id) => window._tableUtil.toggleDetail(id),
    onPrevPage: (page) => window._tableUtil.goToPage(page),
    onNextPage: (page) => window._tableUtil.goToPage(page),
    onCancel: () => window._tableUtil.cancelEdit(),
    onLoad: async (page, pageSize, keyword) => {
      return window._herbsModule.herbsHandlers.onLoad(page, pageSize, keyword);
    }
  },
  users: {
    // 使用 users-module 的 handlers
    onSaveNew: () => saveNewRow(),
    onSave: (id) => {
      const row = window._tableUtil.getRowElement(id);
      if (row) window._usersModule.usersHandlers.onSave(id, row, tableData);
    },
    onDelete: (id) => window._usersModule.usersHandlers.onDelete(id),
    onToggleDetail: (id) => window._tableUtil.toggleDetail(id),
    onPrevPage: (page) => window._tableUtil.goToPage(page),
    onNextPage: (page) => window._tableUtil.goToPage(page),
    onCancel: () => window._tableUtil.cancelEdit(),
    onLoad: async (page, pageSize, keyword) => {
      return window._usersModule.usersHandlers.onLoad(page, pageSize, keyword);
    }
  },
  bookings: {
    // 使用 bookings-module 的 handlers
    onSaveNew: () => saveNewRow(),
    onSave: (id) => {
      const row = window._tableUtil.getRowElement(id);
      if (row) window._bookingsModule.bookingsHandlers.onSave(id, row);
    },
    onDelete: (id) => window._bookingsModule.bookingsHandlers.onDelete(id),
    onToggleDetail: (id) => window._tableUtil.toggleDetail(id),
    onPrevPage: (page) => window._tableUtil.goToPage(page),
    onNextPage: (page) => window._tableUtil.goToPage(page),
    onCancel: () => window._tableUtil.cancelEdit(),
    onLoad: async (page, pageSize, keyword) => {
      return window._bookingsModule.bookingsHandlers.onLoad(page, pageSize, keyword);
    }
  },
  // 只读表 - 使用通用 API
  stock_in_items: {
    onToggleDetail: (id) => window._tableUtil.toggleDetail(id),
    onPrevPage: (page) => window._tableUtil.goToPage(page),
    onNextPage: (page) => window._tableUtil.goToPage(page),
    onCancel: () => window._tableUtil.cancelEdit(),
    onLoad: async (page, pageSize, keyword) => {
      const config = tableConfigs.stock_in_items;
      const searchFieldsParam = config.searchFields ? `&searchFields=${config.searchFields.join(',')}` : '';
      const res = await homeFetch(`/api/readonly/stock_in_items?page=${page}&pageSize=${pageSize}&keyword=${encodeURIComponent(keyword)}${searchFieldsParam}`);
      if (res.code !== 0) throw new Error(res.message);
      return { data: res.data?.rows || [], pagination: res.data?.pagination || {} };
    }
  },
  stock_out_items: {
    onToggleDetail: (id) => window._tableUtil.toggleDetail(id),
    onPrevPage: (page) => window._tableUtil.goToPage(page),
    onNextPage: (page) => window._tableUtil.goToPage(page),
    onCancel: () => window._tableUtil.cancelEdit(),
    onLoad: async (page, pageSize, keyword) => {
      const config = tableConfigs.stock_out_items;
      const searchFieldsParam = config.searchFields ? `&searchFields=${config.searchFields.join(',')}` : '';
      const res = await homeFetch(`/api/readonly/stock_out_items?page=${page}&pageSize=${pageSize}&keyword=${encodeURIComponent(keyword)}${searchFieldsParam}`);
      if (res.code !== 0) throw new Error(res.message);
      return { data: res.data?.rows || [], pagination: res.data?.pagination || {} };
    }
  },
  stock_logs: {
    onToggleDetail: (id) => window._tableUtil.toggleDetail(id),
    onPrevPage: (page) => window._tableUtil.goToPage(page),
    onNextPage: (page) => window._tableUtil.goToPage(page),
    onCancel: () => window._tableUtil.cancelEdit(),
    onLoad: async (page, pageSize, keyword) => {
      const config = tableConfigs.stock_logs;
      const searchFieldsParam = config.searchFields ? `&searchFields=${config.searchFields.join(',')}` : '';
      const res = await homeFetch(`/api/readonly/stock_logs?page=${page}&pageSize=${pageSize}&keyword=${encodeURIComponent(keyword)}${searchFieldsParam}`);
      if (res.code !== 0) throw new Error(res.message);
      return { data: res.data?.rows || [], pagination: res.data?.pagination || {} };
    }
  }
};

// 全局事件分发器
function dispatch(action, ...args) {
  const handler = tableHandlers[currentTable]?.[action];
  if (handler) {
    return handler(...args);
  }
  console.error(`未配置的操作: ${action} for table ${currentTable}`);
}

// 表配置
const tableConfigs = {
  users: {
    displayName: '用户管理',
    columns: [
      { key: 'id', label: 'ID', readonly: true },
      { key: 'openid', label: 'OpenID', readonly: true },
      { key: 'name', label: '姓名', editable: true },
      { key: 'phone', label: '手机号', editable: true },
      {
        key: 'role', label: '角色', type: 'select', options: [
          { value: 'user', label: '普通用户', badge: 'badge-user' },
          { value: 'admin', label: '管理员', badge: 'badge-admin' },
          { value: 'super_admin', label: '超级管理员', badge: 'badge-super_admin' }
        ]
      },
      { key: 'createdAt', label: '创建时间', readonly: true, type: 'datetime' }
    ],
    searchFields: ['name', 'phone', 'openid']
  },
  bookings: {
    displayName: '预约记录',
    columns: [
      { key: 'id', label: 'ID', readonly: true },
      { key: 'phone', label: '手机号', editable: true, required: true },
      { key: 'openid', label: 'OpenID', editable: true },
      { key: 'date', label: '预约日期', editable: true, required: true, type: 'date' },
      { key: 'session', label: '场次', editable: true, type: 'select', options: [
        { value: 'morning', label: '上午' },
        { value: 'afternoon', label: '下午' },
        { value: 'evening', label: '晚上' }
      ]},
      { key: 'personCount', label: '预约人数', editable: true, type: 'number', defaultValue: 1 },
      { key: 'time', label: '预约时间', editable: true, type: 'time' },
      {
        key: 'status', label: '状态', type: 'select', editable: true, options: [
          { value: 'confirmed', label: '待签到', badge: 'badge-active' },
          { value: 'checked_in', label: '已签到', badge: 'badge-reviewed' }
        ]
      },
      { key: 'createTime', label: '创建时间', readonly: true, type: 'datetime' }
    ],
    searchFields: ['phone', 'openid', 'date', 'session']
  },
  prescriptions: {
    displayName: '处方记录',
    columns: [
      { key: 'id', label: 'ID', readonly: true },
      { key: 'prescriptionId', label: '处方号', readonly: true },
      { key: 'openid', label: 'OpenID', readonly: true },
      {
        key: 'status', label: '状态', type: 'select', readonly: true, options: [
          { value: '待审核', label: '待审核', badge: 'badge-pending' },
          { value: '已审核', label: '已审核', badge: 'badge-reviewed' },
          { value: '已结算', label: '已结算', badge: 'badge-stocked' }
        ]
      },
      { key: 'reviewer', label: '审核人', readonly: true },
      { key: 'prescriptionDate', label: '处方日期', readonly: true, type: 'date' },
      { key: 'createTime', label: '创建时间', readonly: true, type: 'datetime' }
    ],
    searchFields: ['prescriptionId', 'openid'],
    hasDetail: true
  },
  herbs: {
    displayName: '药材信息',
    columns: [
      { key: 'id', label: 'ID', readonly: true },
      { key: 'name', label: '药材名称', editable: true, required: true },
      { key: 'alias', label: '别名', editable: true },
      { key: 'cabinetNo', label: '柜号', editable: true },
      { key: 'coefficient', label: '系数', editable: true, type: 'number' },
      { key: 'costPrice', label: '成本价', editable: true, type: 'number' },
      { key: 'salePrice', label: '售卖单价', readonly: true, readonlyInput: true, type: 'number' },
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
      { key: 'purchaseDate', label: '下单日期', editable: true, type: 'date', defaultValue: 'today' },
      { key: 'orderDate', label: '入库日期', editable: true, type: 'date', defaultValue: 'today' },
      { key: 'supplierName', label: '供应商', editable: true, required: true },
      { key: 'totalPrice', label: '总价', readonly: true, type: 'number' },
      {
        key: 'status', label: '状态', type: 'select', readonly: true, options: [
          { value: 'draft', label: '草稿', badge: 'badge-draft' },
          { value: 'stocked', label: '已入库', badge: 'badge-stocked' }
        ]
      }
    ],
    searchFields: ['supplierName'],
    hasDetail: true,
    detailTable: 'stock_in_items'
  },
  stock_out_orders: {
    displayName: '执药单管理',
    columns: [
      { key: 'id', label: 'ID', readonly: true },
      { key: 'prescriptionTime', label: '处方时间', readonly: true, type: 'datetime' },
      { key: 'prescriptionId', label: '处方ID', editable: true },
      { key: 'pharmacist', label: '药师', editable: true },
      { key: 'reviewer', label: '审核人', readonly: true },
      {
        key: 'status', label: '状态', type: 'select', readonly: true, options: [
          { value: 'pending', label: '待执药', badge: 'badge-pending' },
          { value: 'settled', label: '已结算', badge: 'badge-stocked' }
        ]
      },
      { key: 'totalPrice', label: '总价', readonly: true, type: 'number' },
      { key: 'remark', label: '备注', editable: true }
    ],
    searchFields: ['prescriptionId', 'pharmacist'],
    hasDetail: true,
    detailTable: 'stock_out_items'
  },
  stock_in_items: {
    displayName: '入库明细',
    readonly: true,
    columns: [
      { key: 'id', label: 'ID', readonly: true },
      { key: 'orderId', label: '入库单ID', readonly: true },
      { key: 'herbName', label: '药材名称', readonly: true },
      { key: 'quality', label: '品质', readonly: true },
      { key: 'origin', label: '产地', readonly: true },
      { key: 'productionDate', label: '生产日期', readonly: true, type: 'date' },
      { key: 'expiryDate', label: '保质期至', readonly: true, type: 'date' },
      { key: 'quantity', label: '克数', readonly: true, type: 'number' },
      { key: 'unitPrice', label: '进货单价', readonly: true, type: 'number' },
      { key: 'costPrice', label: '成本价', readonly: true, type: 'number' },
      { key: 'remark', label: '备注', readonly: true }
    ],
    searchFields: ['herbName']
  },
  stock_out_items: {
    displayName: '执药明细',
    readonly: true,
    columns: [
      { key: 'id', label: 'ID', readonly: true },
      { key: 'orderId', label: '执药单ID', readonly: true },
      { key: 'herbName', label: '药材名称', readonly: true },
      { key: 'cabinetNo', label: '柜号', readonly: true },
      { key: 'quantity', label: '克数', readonly: true, type: 'number' },
      { key: 'unitPrice', label: '单价', readonly: true, type: 'number' },
      { key: 'totalPrice', label: '本药总价', readonly: true, type: 'number' }
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
    searchFields: ['herbName', 'orderNo', 'action'],
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
let expandedRows = new Set();
let pendingFocusCol = null;
let tableData = [];

// ==================== 初始化 ====================

document.addEventListener('DOMContentLoaded', async () => {
  // 初始化 Stock 模块
  if (window._stockModule && window._stockModule.initStockModule) {
    window._stockModule.initStockModule({
      homeFetch: homeFetch,
      showToast: showToast,
      showConfirm: showConfirm,
      showAlert: showAlert,
      escapeHtml: escapeHtml,
      loadTableData: loadTableData,
      loadStats: loadStats,
      getTableData: () => tableData,
      getCurrentTable: () => currentTable,
      getExpandedRows: () => expandedRows,
      getTableConfig: () => tableConfigs,
      showImagePreview: showImagePreview
    });
    console.log('[admin.js] Stock 模块已初始化');
  }

  // 初始化表格工具模块
  if (window._tableUtil && window._tableUtil.initTableUtil) {
    window._tableUtil.initTableUtil({
      getCurrentPage: () => currentPage,
      setCurrentPage: (page) => { currentPage = page; },
      getEditingRowId: () => editingRowId,
      setEditingRowId: (id) => { editingRowId = id; },
      getSelectedIds: () => selectedIds,
      setSelectedIds: (ids) => { selectedIds = ids; },
      getExpandedRows: () => expandedRows,
      setExpandedRows: (rows) => { expandedRows = rows; },
      loadTableData: loadTableData
    });
    console.log('[admin.js] 表格工具模块已初始化');
  }

  // 初始化导入导出模块
  if (window._importExportModule && window._importExportModule.initImportExportModule) {
    window._importExportModule.initImportExportModule({
      getTableConfigs: () => tableConfigs,
      getCurrentTable: () => currentTable,
      homeFetch: homeFetch,
      showToast: showToast,
      loadTableData: loadTableData
    });
    console.log('[admin.js] 导入导出模块已初始化');
  }

  // 初始化处方模块
  if (window._prescriptionModule && window._prescriptionModule.initPrescriptionModule) {
    window._prescriptionModule.initPrescriptionModule({
      homeFetch: homeFetch,
      showToast: showToast,
      showAlert: showAlert,
      loadTableData: loadTableData,
      showConfirm: showConfirm,
      showImagePreview: showImagePreview,
      getTableData: () => tableData,
      getTableConfig: () => tableConfigs
    });
    console.log('[admin.js] 处方模块已初始化');
  }

  // 初始化药材模块
  if (window._herbsModule && window._herbsModule.initHerbsModule) {
    window._herbsModule.initHerbsModule({
      homeFetch: homeFetch,
      showToast: showToast,
      showConfirm: showConfirm,
      loadTableData: loadTableData,
      loadStats: loadStats,
      getTableData: () => tableData,
      getCurrentTable: () => currentTable,
      getEditingRowId: () => editingRowId,
      setEditingRowId: (id) => { editingRowId = id; },
      clearSelectedIds: () => { selectedIds = []; }
    });
    console.log('[admin.js] 药材模块已初始化');
  }

  // 初始化用户模块
  if (window._usersModule && window._usersModule.initUsersModule) {
    window._usersModule.initUsersModule({
      homeFetch: homeFetch,
      showToast: showToast,
      showConfirm: showConfirm,
      loadTableData: loadTableData,
      loadStats: loadStats,
      getTableData: () => tableData,
      getCurrentTable: () => currentTable,
      getEditingRowId: () => editingRowId,
      setEditingRowId: (id) => { editingRowId = id; },
      clearSelectedIds: () => { selectedIds = []; }
    });
    console.log('[admin.js] 用户模块已初始化');
  }

  // 初始化预约模块
  if (window._bookingsModule && window._bookingsModule.initBookingsModule) {
    window._bookingsModule.initBookingsModule({
      homeFetch: homeFetch,
      showToast: showToast,
      showConfirm: showConfirm,
      loadTableData: loadTableData,
      loadStats: loadStats,
      getTableData: () => tableData,
      getCurrentTable: () => currentTable,
      getEditingRowId: () => editingRowId,
      setEditingRowId: (id) => { editingRowId = id; },
      clearSelectedIds: () => { selectedIds = []; }
    });
    console.log('[admin.js] 预约模块已初始化');
  }

  // 检查登录状态
  const urlParams = new URLSearchParams(window.location.search);
  const phoneNumber = urlParams.get('phone_number');
  const openid = localStorage.getItem('user_openid');
  
  // 如果没有 phone_number 参数或没有 openid，跳转到登录页
  if (!phoneNumber || !openid) {
    window.location.href = '/login.html';
    return;
  }
  
  renderSidebar();
  await loadStats();
  switchPage('dashboard');
});

// ==================== API 请求 ====================

async function homeFetch(url, options = {}) {
  // 从 URL 参数中获取 phone_number
  const urlParams = new URLSearchParams(window.location.search);
  const phoneNumber = urlParams.get('phone_number');
  
  // 从 localStorage 获取 openid（登录时保存）
  const openid = localStorage.getItem('user_openid');
  
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      // 如果有 phone_number 参数，添加到 header 中用于权限验证
      ...(phoneNumber ? { 'x-phone': phoneNumber } : {}),
      // 如果有 openid，也添加到 header 中
      ...(openid ? { 'x-openid': openid } : {}),
      ...options.headers
    }
  });
  
  const data = await res.json();
  
  // 如果返回错误提示需要重新登录，跳转到登录页
  if (data.code === 1 && (data.message?.includes('openid') || data.message?.includes('未授权'))) {
    localStorage.removeItem('user_openid');
    localStorage.removeItem('user_phone');
    window.location.href = '/login.html';
    return data;
  }
  
  return data;
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
  selectedIds = [];
  editingRowId = null;
  searchKeyword = '';
  currentPage = 1;

  setActiveMenu(id);

  if (id === 'dashboard') {
    renderDashboard();
  } else if (id === 'schedule') {
    renderSchedulePage();
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
    const res = await homeFetch('/api/system/stats');
    if (res.code !== 0) throw new Error(res.message);

    const tables = res.data.tables;

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
        ${!config.readonly ? '<button class="btn btn-primary" id="addNewBtn">+ 新增记录</button>' : ''}
      </div>
    </div>
    <div class="table-container">
      <div class="table-toolbar">
        <div class="toolbar-left">
          <input type="text" class="search-input" placeholder="搜索..." id="searchInput" value="${searchKeyword}">
          ${!config.readonly ? '<button class="btn btn-danger" id="batchDeleteBtn" disabled>🗑️ 批量删除</button>' : ''}
          <button class="btn btn-success" id="exportBtn">📤 导出</button>
          ${!config.readonly ? `<label class="btn btn-primary" style="margin-left:8px;cursor:pointer;">📥 导入
            <input type="file" accept=".xlsx,.xls" style="display:none" id="importFile">
          </label>` : ''}
        </div>
        <div class="selected-count" id="selectedCount"></div>
      </div>
      <div id="tableBody">
        <div class="loading">加载中...</div>
      </div>
    </div>
  `;

  const addNewBtn = document.getElementById('addNewBtn');
  if (addNewBtn) addNewBtn.addEventListener('click', addNewRow);
  const batchDeleteBtn = document.getElementById('batchDeleteBtn');
  if (batchDeleteBtn) batchDeleteBtn.addEventListener('click', batchDelete);
  document.getElementById('searchInput').addEventListener('keyup', handleSearch);
  
  // 导入导出按钮事件
  document.getElementById('exportBtn').addEventListener('click', window._importExportModule.exportTableData);
  const importFile = document.getElementById('importFile');
  if (importFile) importFile.addEventListener('change', window._importExportModule.handleImportFile);

  await loadTableData();
}

async function loadTableData() {
  const config = tableConfigs[currentTable];
  const tableBody = document.getElementById('tableBody');

  console.log(`[loadTableData] currentTable=${currentTable}, currentPage=${currentPage}, pageSize=${pageSize}, keyword=${searchKeyword}`);

  try {
    let rows, pagination;

    // 使用 tableHandlers 的 onLoad
    if (!tableHandlers[currentTable]?.onLoad) {
      throw new Error(`表 ${currentTable} 未配置 onLoad 处理器`);
    }
    const result = await tableHandlers[currentTable].onLoad(currentPage, pageSize, searchKeyword);
    rows = result.data;
    pagination = result.pagination;

    tableData = rows;
    const columns = config.columns;

    // 调试：检查返回的数据是否包含明细
    if (currentTable === 'stock_in_orders' || currentTable === 'stock_out_orders') {
      rows.forEach((row, index) => {
        console.log('[loadTableData] 订单', index, 'ID:', row.id, '明细数量:', row.items?.length || 0);
        if (row.items && row.items.length > 0) {
          console.log('[loadTableData] 订单', index, '明细数据:', row.items);
        }
      });
    }

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
              ${!config.readonly ? `<th class="col-checkbox">
                <input type="checkbox" class="checkbox" id="selectAll" onchange="toggleSelectAll(this.checked)">
              </th>` : ''}
              ${columns.map(col => `<th>${col.label}</th>`).join('')}
              ${(!config.readonly || hasDetail || currentTable === 'stock_in_orders' || currentTable === 'stock_out_orders') ? '<th class="col-action">操作</th>' : ''}
            </tr>
          </thead>
          <tbody>
    `;

    // 新增行（在第一行显示）
    if (editingRowId === 'new' && !config.readonly) {
      html += `<tr class="editing" data-id="new">`;
      html += `<td class="col-checkbox"><input type="checkbox" class="checkbox" disabled></td>`;
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
        } else if (col.type === 'date') {
          // 日期类型使用 type="date"
          let dateValue = '';
          if (col.defaultValue === 'today') {
            const today = new Date();
            dateValue = today.toISOString().split('T')[0]; // YYYY-MM-DD 格式
          }
          html += `<td><input type="date" class="cell-input" data-col="${col.key}" value="${dateValue}"></td>`;
        } else if (col.type === 'number') {
          html += `<td><input type="number" class="cell-input" data-col="${col.key}" placeholder="${col.label}"></td>`;
        } else {
          html += `<td><input type="text" class="cell-input" data-col="${col.key}" placeholder="${col.label}"></td>`;
        }
      });
      html += `<td class="col-action">
        <button class="action-btn action-btn-save" data-action="saveNew">保存</button>
        <button class="action-btn action-btn-cancel" data-action="cancel">取消</button>
      </td></tr>`;
    }

    rows.forEach((row, rowIndex) => {
      const isEditing = String(editingRowId) === String(row.id);
      const isExpanded = expandedRows.has(String(row.id));

      // 主行
      html += `<tr data-id="${row.id}" class="${isEditing ? 'editing' : ''}">`;
      if (!config.readonly) {
        html += `<td class="col-checkbox">
          <input type="checkbox" class="checkbox row-checkbox" data-id="${row.id}"
            ${selectedIds.includes(row.id) ? 'checked' : ''}
            onchange="toggleSelect('${row.id}')">
        </td>`;
      }

      columns.forEach(col => {
        const value = row[col.key] ?? '';
        const isReadonly = config.readonly || col.readonly;
        const isReadonlyInput = col.readonlyInput; // 是否在编辑时显示为只读输入框

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
        } else if (isEditing && isReadonly && isReadonlyInput) {
          // 编辑状态下，标记为 readonlyInput 的字段显示为只读输入框
          html += `<td><input type="${col.type === 'number' ? 'number' : 'text'}" class="cell-input cell-readonly-input" data-col="${col.key}" value="${escapeHtml(value)}" readonly></td>`;
        } else {
          let displayValue = value;
          if (col.type === 'datetime' && value) {
            displayValue = new Date(value).toLocaleString('zh-CN');
          } else if (col.type === 'date' && value) {
            displayValue = new Date(value).toLocaleDateString('zh-CN');
          } else if (col.type === 'select' && col.options) {
            const opt = col.options.find(o => o.value === value);
            displayValue = opt ? (opt.badge ? `<span class="badge ${opt.badge}">${opt.label}</span>` : opt.label) : value;
          }

          const cellClass = isReadonly ? 'cell-readonly' : 'cell-editable';
          const isLongText = col.key === 'openid' || col.key === 'orderNo' || col.key === 'checkNo';
          
          // 药材库存预警：库存低于最低库存时字体变红
          let stockWarning = '';
          if (currentTable === 'herbs' && col.key === 'stock' && row.minValue !== undefined) {
            const stock = parseFloat(value) || 0;
            const minValue = parseFloat(row.minValue) || 0;
            if (stock < minValue) {
              stockWarning = 'style="color: #e74c3c; font-weight: bold;"';
            }
          }
          
          // 已结算处方禁止编辑
          const isSettledPrescription = currentTable === 'prescriptions' && row.status === '已结算';
          const canEdit = !isReadonly && !isSettledPrescription;

          html += `<td class="${canEdit ? 'cell-clickable' : ''}" data-row-id="${row.id}" data-col-key="${col.key}">
            <span class="${cellClass} ${isLongText ? 'cell-long' : ''}" ${stockWarning} title="${escapeHtml(String(value))}">${displayValue || '-'}</span>
          </td>`;
        }
      });

      // 操作列（只读表且无详情时隐藏操作列）
      const showActionCol = !config.readonly || hasDetail || currentTable === 'stock_in_orders' || currentTable === 'stock_out_orders';
      if (showActionCol) {
        html += `<td class="col-action">`;

        // 展开按钮
        if (hasDetail) {
          html += `<button class="action-btn action-btn-expand" data-action="toggleDetail" data-id="${row.id}">
            ${isExpanded ? '收起' : '展开'}
          </button>`;
        }

        // 处方审核按钮
        if (currentTable === 'prescriptions' && row.status === '待审核') {
          html += `<button class="action-btn action-btn-review" data-action="reviewPrescription" data-id="${row.id}" data-prescription-id="${row.prescriptionId}">审核</button>`;
        }

        // 入库单特殊操作按钮
        if (currentTable === 'stock_in_orders') {
          if (row.status === 'draft') {
            html += `<button class="action-btn action-btn-confirm" data-action="confirmStockIn" data-id="${row.id}">确认入库</button>`;
          } else if (row.status === 'stocked') {
            html += `<button class="action-btn action-btn-revert" data-action="revertToDraft" data-id="${row.id}">退回草稿</button>`;
          }
        }

        if (isEditing) {
          html += `<button class="action-btn action-btn-save" data-action="save" data-id="${row.id}">保存</button>`;
        } else if (!config.readonly) {
          // 执药单特殊处理
          if (currentTable === 'stock_out_orders' && row.status === 'settled') {
            html += `<button class="action-btn action-btn-revoke" data-action="revokeOrder" data-id="${row.id}" data-order-id="${row.id}">撤销</button>`;
          } else if ((currentTable !== 'stock_in_orders' || row.status === 'draft') && 
                     !(currentTable === 'prescriptions' && row.status === '已结算')) {
            // 入库单已入库状态不显示删除按钮（通过退回草稿后删除）
            // 已结算处方不显示删除按钮
            html += `<button class="action-btn action-btn-delete" data-action="delete" data-id="${row.id}">删除</button>`;
          }
        }

        html += `</td>`;
      }

      html += `</tr>`;

      // 详情行
      if (hasDetail && isExpanded) {
        if (currentTable === 'prescriptions') {
          // 处方详情
          html += window._prescriptionModule.renderPrescriptionDetail(row);
        } else {
          // 入库单/执药单详情
          html += window._stockModule.renderOrderDetail(row, config, detailTable);
        }
      }
    });

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

    // 绑定事件
    tableBody.onclick = handleTableClick;
    updateSelectedCount();
    bindAutoSaveEvents();

    // 入库单：为所有展开的订单计算总金额
    if (currentTable === 'stock_in_orders') {
      expandedRows.forEach(orderId => {
        window._stockModule.calculateOrderTotalAmount(orderId);
      });
    }

    // 入库单：异步更新所有展开订单的成本价提示
    if (currentTable === 'stock_in_orders' && expandedRows.size > 0) {
      window._stockModule.updateAllCostPriceHints(expandedRows).catch(err => {
        console.error('[Admin] 更新成本价提示失败:', err);
      });
    }

    // 自动对焦
    if (editingRowId && pendingFocusCol) {
      setTimeout(() => {
        const input = document.querySelector(`tr[data-id="${editingRowId}"] .cell-input[data-col="${pendingFocusCol}"], tr[data-id="${editingRowId}"] .cell-select[data-col="${pendingFocusCol}"]`);
        if (input) {
          input.focus();
          input.select && input.select();
        }
        pendingFocusCol = null;
      }, 0);
    }

  } catch (err) {
    tableBody.innerHTML = `<div class="empty-state"><div class="empty-icon">❌</div><p>${err.message}</p></div>`;
  }
}

// 图片预览
function showImagePreview(src) {
  let modal = document.getElementById('imagePreviewModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'imagePreviewModal';
    modal.className = 'image-preview-modal';
    modal.innerHTML = `
      <div class="image-preview-content">
        <img id="previewImage" src="" />
        <div class="image-preview-close" onclick="closeImagePreview()">&times;</div>
      </div>
    `;
    document.body.appendChild(modal);
  }
  document.getElementById('previewImage').src = src;
  modal.classList.add('show');
}

function closeImagePreview() {
  const modal = document.getElementById('imagePreviewModal');
  if (modal) {
    modal.classList.remove('show');
  }
}

// 处理表格点击事件
function handleTableClick(e) {
  const btn = e.target.closest('[data-action]');
  if (btn) {
    // 如果启用新模块，使用 tableHandlers
    if (USE_NEW_MODULES) {
      const action = btn.dataset.action;
      // action -> handlerName (save -> onSave)
      const handlerName = 'on' + action.charAt(0).toUpperCase() + action.slice(1);
      const handler = tableHandlers[currentTable]?.[handlerName];

      if (handler) {
        // 从 btn 读取必要参数并调用
        const id = btn.dataset.id;
        const orderId = btn.dataset.orderId;
        const page = btn.dataset.page;
        const prescriptionId = btn.dataset.prescriptionId;

        if (action === 'prevPage' || action === 'nextPage') {
          handler(parseInt(page));
        } else if (action === 'saveDetail' || action === 'deleteDetail') {
          handler(id, orderId);
        } else if (action === 'saveDetailNew' || action === 'zoomDetail' || action === 'exportDetail' || action === 'settleOrder' || action === 'revokeOrder') {
          handler(orderId);
        } else if (action === 'reviewPrescription') {
          handler(id, prescriptionId);
        } else if (action === 'confirmStockIn' || action === 'revertToDraft') {
          handler(id);
        } else {
          handler(id);
        }
        return;
      }

      // 未找到 handler，输出错误
      console.error(`未配置的操作: ${action} for table ${currentTable}`);
    }
  }  // end if (btn)

  // 单元格点击进入编辑模式
  const cell = e.target.closest('.cell-clickable');
  if (cell && editingRowId !== 'new') {
    const rowId = cell.dataset.rowId;
    const colKey = cell.dataset.colKey;
    
    // 已结算处方禁止编辑
    if (currentTable === 'prescriptions') {
      const row = tableData.find(r => String(r.id) === String(rowId));
      if (row && row.status === '已结算') {
        showToast('已结算处方不可编辑', 'error');
        return;
      }
    }
    
    // 已入库的入库单禁止编辑
    if (currentTable === 'stock_in_orders') {
      const row = tableData.find(r => String(r.id) === String(rowId));
      if (row && row.status === 'stocked') {
        showToast('已入库的入库单不可编辑', 'error');
        return;
      }
    }
    
    if (String(editingRowId) !== String(rowId)) {
      pendingFocusCol = colKey;
      startEdit(rowId);
    }
  }
}

// ==================== 自动保存事件 ====================

function bindAutoSaveEvents() {
  const detailInputs = document.querySelectorAll('.detail-input');
  console.log(`[bindAutoSaveEvents] 绑定 ${detailInputs.length} 个明细输入框事件`);

  detailInputs.forEach(input => {
    const col = input.dataset.col;

    input.removeEventListener('blur', handleDetailBlur);
    input.addEventListener('blur', handleDetailBlur);

    if (input.dataset.col === 'quantity' || input.dataset.col === 'unitPrice') {
      input.removeEventListener('input', handleCalcSourceInput);
      input.addEventListener('input', handleCalcSourceInput);
    }

    if (input.dataset.col === 'herbName') {
      input.removeEventListener('input', window._stockModule.handleHerbNameInput);
      input.addEventListener('input', window._stockModule.handleHerbNameInput);
    }
    
    // 入库明细：克数和进货单价失焦时计算成本价
    if (input.dataset.costCalc === 'true') {
      input.removeEventListener('blur', window._stockModule.handleCostCalcBlur);
      input.addEventListener('blur', window._stockModule.handleCostCalcBlur);
    }
  });

  const cellInputs = document.querySelectorAll('.cell-input, .cell-select');
  cellInputs.forEach(input => {
    input.removeEventListener('blur', handleCellBlur);
    input.addEventListener('blur', handleCellBlur);
  });
}

function handleCalcSourceInput(e) {
  // 不再清除 manuallyModified 标记
}

async function handleDetailBlur(e) {
  const input = e.target;
  const row = input.closest('tr');
  if (!row) {
    console.log('[handleDetailBlur] row not found');
    return;
  }

  const isNew = input.dataset.isNew === 'true';
  const orderId = row.dataset.orderId;
  const detailId = input.dataset.detailId;
  const colKey = input.dataset.col;

  console.log(`[handleDetailBlur] currentTable=${currentTable}, orderId=${orderId}, colKey=${colKey}`);

  // 入库单：只在 quantity 和 unitPrice 失焦时计算订单总金额和成本价
  if (currentTable === 'stock_in_orders' && orderId) {
    if (colKey === 'quantity' || colKey === 'unitPrice') {
      console.log(`[handleDetailBlur] 触发成本价计算, orderId=${orderId}`);
      await window._stockModule.calculateOrderTotalAmount(orderId);
      // 重新计算该订单的成本价（只针对修改的字段所在的行）
      window._stockModule.recalculateCostPricesForOrder(orderId);
    }
  }
  
  // 执药单：计算明细总价并自动保存
  if (currentTable === 'stock_out_orders') {
    await window._stockModule.calculateDetailTotalPrice(row);
  }
}

async function handleCellBlur(e) {
  const input = e.target;
  const rowElement = input.closest('tr');
  if (!rowElement) return;

  const colKey = input.dataset.col;
  
  // 药材表：成本价或系数失焦时自动计算售卖单价
  if (currentTable === 'herbs' && (colKey === 'costPrice' || colKey === 'coefficient')) {
    const costPriceInput = rowElement.querySelector('input[data-col="costPrice"]');
    const coefficientInput = rowElement.querySelector('input[data-col="coefficient"]');
    const salePriceInput = rowElement.querySelector('input[data-col="salePrice"]');
    
    if (costPriceInput && coefficientInput && salePriceInput) {
      const costPrice = parseFloat(costPriceInput.value) || 0;
      const coefficient = parseFloat(coefficientInput.value) || 1;
      const newSalePrice = costPrice * coefficient;
      
      // 直接更新售卖单价 input 的值
      salePriceInput.value = newSalePrice.toFixed(2);
    }
  }
}

// ==================== 编辑操作 ====================

function startEdit(rowId) {
  editingRowId = String(rowId);
  loadTableData();
}

function cancelEdit() {
  editingRowId = null;
  selectedIds = [];
  loadTableData();
}

function addNewRow() {
  if (editingRowId === 'new') {
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
    // 获取API路径
    let apiUrl;
    let method = 'PUT';

    if (currentTable === 'herbs' && window._stockModule) {
      apiUrl = window._stockModule.getHerbApiPath('update', rowId);
    } else if (currentTable === 'users') {
      // 用户管理使用专门的API（需要openid而非id）
      const row = tableData.find(r => String(r.id) === String(rowId));
      if (!row) {
        showToast('找不到用户数据', 'error');
        return;
      }

      // 如果角色有变化，需要单独调用 set-role API
      if (data.role && data.role !== row.role) {
        const roleRes = await homeFetch('/api/user/set-role', {
          method: 'POST',
          body: JSON.stringify({
            openid: row.openid,
            role: data.role
          })
        });
        if (roleRes.code !== 0) throw new Error(roleRes.message);
      }

      // 更新其他字段（name, phone）
      const { name, phone } = data;
      if (name !== undefined || phone !== undefined) {
        apiUrl = `/api/user/${row.openid}`;
        // 只传递 name 和 phone
        Object.keys(data).forEach(key => {
          if (key !== 'name' && key !== 'phone') delete data[key];
        });
      } else {
        // 没有其他字段需要更新，直接返回成功
        showToast('保存成功', 'success');
        editingRowId = null;
        selectedIds = [];
        loadTableData();
        return;
      }
    } else if (currentTable === 'bookings') {
      // 预约管理使用专门的API
      apiUrl = `/api/bookings/${rowId}`;
    } else if (currentTable === 'stock_in_orders') {
      // 入库单使用专门的API
      apiUrl = `/api/stock/in/orders/${rowId}`;
    } else if (currentTable === 'stock_out_orders') {
      // 执药单使用专门的API
      apiUrl = `/api/stock/out/orders/${rowId}`;
    } else if (currentTable === 'prescriptions') {
      // 处方管理使用专门的API
      const res = await window._prescriptionModule.savePrescription(rowId, data);
      if (res.code !== 0) throw new Error(res.message);

      showToast('保存成功', 'success');
      editingRowId = null;
      selectedIds = [];
      loadTableData();
      loadStats();
      return;
    } else {
      throw new Error(`未知的表类型: ${currentTable}`);
    }

    const res = await homeFetch(apiUrl, {
      method: method,
      body: JSON.stringify(data)
    });

    if (res.code !== 0) throw new Error(res.message);

    showToast('保存成功', 'success');
    editingRowId = null;
    selectedIds = [];

    // 如果保存的是药材信息，清除药材信息缓存
    if (currentTable === 'herbs' && window._stockModule) {
      window._stockModule.clearHerbInfoCache();
    }

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
    // 收集所有有值的字段
    if (input.value.trim()) {
      data[input.dataset.col] = input.value.trim();
    }
  });

  // 对于数字类型字段，如果没有值但有默认值，使用默认值
  const config = tableConfigs[currentTable];
  config.columns.forEach(col => {
    if (col.type === 'number' && data[col.key] === undefined && col.defaultValue !== undefined) {
      data[col.key] = col.defaultValue;
    }
  });

  // 各模块的特殊验证
  if (currentTable === 'stock_in_orders' && window._stockModule) {
    const validation = window._stockModule.validateNewOrderData(data, currentTable);
    if (!validation.valid) {
      showToast(validation.error, 'error');
      return;
    }
  }

  if (Object.keys(data).length === 0) {
    showToast('请至少填写一个字段', 'error');
    return;
  }

  try {
    // 获取创建的 API 路径
    let apiUrl;

    if (currentTable === 'stock_in_orders' && window._stockModule) {
      apiUrl = window._stockModule.getCreateOrderApiPath(currentTable);
    } else if (currentTable === 'stock_out_orders' && window._stockModule) {
      apiUrl = window._stockModule.getCreateOrderApiPath(currentTable);
    } else if (currentTable === 'herbs' && window._stockModule) {
      apiUrl = window._stockModule.getHerbApiPath('create');
    } else if (currentTable === 'bookings') {
      apiUrl = '/api/booking';
    } else {
      throw new Error(`未知的表类型: ${currentTable}`);
    }

    const res = await homeFetch(apiUrl, {
      method: 'POST',
      body: JSON.stringify(data)
    });

    if (res.code !== 0) throw new Error(res.message);

    showToast('新增成功', 'success');
    editingRowId = null;
    selectedIds = [];

    // 如果新增的是药材信息，清除药材信息缓存
    if (currentTable === 'herbs' && window._stockModule) {
      window._stockModule.clearHerbInfoCache();
    }

    loadTableData();
    loadStats();
  } catch (err) {
    showToast('新增失败: ' + err.message, 'error');
  }
}

async function deleteRow(rowId) {
  const row = tableData.find(r => String(r.id) === String(rowId));
  
  // 各模块的删除前验证
  if (currentTable === 'prescriptions' && window._prescriptionModule) {
    const validation = window._prescriptionModule.validateDelete(rowId, row);
    if (!validation.canDelete) {
      showToast(validation.message, 'error');
      return;
    }
  }
  
  // 入库单的特殊处理
  if (currentTable === 'stock_in_orders' && window._stockModule) {
    const handleResult = window._stockModule.handleDeleteBeforeConfirm(rowId, row, currentTable);
    if (handleResult.needSpecialHandling) {
      showConfirm('确认删除', handleResult.message, async () => {
        try {
          const result = await window._stockModule.handleSpecialDelete(rowId);
          if (!result.success) {
            throw new Error(result.error);
          }
          showToast('删除成功', 'success');
          loadTableData();
          loadStats();
        } catch (err) {
          showToast('删除失败: ' + err.message, 'error');
        }
      });
      return;
    }
  }

  // 构建确认消息和删除逻辑
  let confirmMessage = '确定要删除这条记录吗？';
  let deleteAction = async () => {
    try {
      // 获取删除 API 路径
      let deleteApi;

      if (currentTable === 'herbs' && window._stockModule) {
        deleteApi = window._stockModule.getHerbApiPath('delete', rowId);
      } else if (currentTable === 'users') {
        // 用户删除使用专门API
        deleteApi = `/api/user/${rowId}`;
      } else if (currentTable === 'bookings') {
        // 预约管理使用专门的API
        deleteApi = `/api/booking/${rowId}`;
      } else if ((currentTable === 'stock_in_orders' || currentTable === 'stock_out_orders') && window._stockModule) {
        deleteApi = window._stockModule.getDeleteApiPath(rowId, currentTable);
      } else if (currentTable === 'prescriptions') {
        // 处方管理使用专门的API
        const res = await window._prescriptionModule.deletePrescription(rowId);
        if (res.code !== 0) throw new Error(res.message);

        showToast('删除成功', 'success');
        loadTableData();
        loadStats();
        return;
      } else {
        throw new Error(`未知的表类型: ${currentTable}`);
      }

      const res = await homeFetch(deleteApi, { method: 'DELETE' });
      if (res.code !== 0) throw new Error(res.message);

      showToast('删除成功', 'success');

      // 如果删除的是药材信息，清除药材信息缓存
      if (currentTable === 'herbs' && window._stockModule) {
        window._stockModule.clearHerbInfoCache();
      }

      loadTableData();
      loadStats();
    } catch (err) {
      showToast('删除失败: ' + err.message, 'error');
    }
  };

  // 入库单/执药单需要显示明细数量警告
  if ((currentTable === 'stock_in_orders' || currentTable === 'stock_out_orders') && window._stockModule) {
    try {
      const detailCount = await window._stockModule.getOrderDetailCount(rowId, currentTable);
      const labels = window._stockModule.getOrderLabels(currentTable);
      
      if (detailCount > 0) {
        confirmMessage = `确定要删除这条${labels.orderLabel}吗？\n\n⚠️ 关联的 ${detailCount} 条${labels.detailLabel}也将一并删除！`;
      } else {
        confirmMessage = `确定要删除这条${labels.orderLabel}吗？`;
      }
    } catch (err) {
      console.error('获取明细数量失败:', err);
      // 即使获取失败，也允许删除，使用默认消息
    }
  }

  showConfirm('确认删除', confirmMessage, deleteAction);
}

// ==================== 展开详情操作 ====================

async function toggleDetail(rowId) {
  const idStr = String(rowId);
  const isExpanding = !expandedRows.has(idStr);
  
  if (isExpanding) {
    expandedRows.add(idStr);
  } else {
    expandedRows.delete(idStr);
  }
  
  loadTableData();
  
  // 入库单：展开时不需要特殊处理，成本价在失焦时计算
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

  // 检查是否是入库单或执药单，需要统计明细数量
  if (currentTable === 'stock_in_orders' || currentTable === 'stock_out_orders') {
    try {
      const tableLabel = currentTable === 'stock_in_orders' ? '入库单' : '执药单';
      const detailLabel = currentTable === 'stock_in_orders' ? '入库明细' : '执药明细';

      let totalDetailCount = 0;
      for (const id of selectedIds) {
        // 使用 stock-module 中的专用函数获取明细数量
        totalDetailCount += await window._stockModule.getOrderDetailCount(id, currentTable);
      }

      const message = totalDetailCount > 0
        ? `确定要删除选中的 ${selectedIds.length} 条${tableLabel}吗？\n\n⚠️ 关联的 ${totalDetailCount} 条${detailLabel}也将一并删除！`
        : `确定要删除选中的 ${selectedIds.length} 条${tableLabel}吗？`;

      showConfirm('批量删除', message, async () => {
        try {
          let deletedCount = 0;

          // 药材表使用专门的批量删除函数
          if (currentTable === 'herbs' && window._stockModule) {
            const result = await window._stockModule.handleHerbBatchDelete(selectedIds);
            if (!result.success) {
              throw new Error(result.error);
            }
            deletedCount = result.deletedCount;
          } else if (currentTable === 'prescriptions') {
            // 处方表使用专门的批量删除函数
            for (const id of selectedIds) {
              const res = await window._prescriptionModule.deletePrescription(id);
              if (res.code !== 0) {
                throw new Error(`删除处方失败: ${res.message}`);
              }
              deletedCount++;
            }
          } else if (currentTable === 'stock_in_orders' || currentTable === 'stock_out_orders') {
            // 入库单/执药单逐个删除（确保触发级联操作）
            for (const id of selectedIds) {
              const deleteApi = window._stockModule.getDeleteApiPath(id, currentTable);
              const res = await homeFetch(deleteApi, { method: 'DELETE' });
              if (res.code !== 0) {
                throw new Error(`删除${currentTable === 'stock_in_orders' ? '入库单' : '执药单'}失败: ${res.message}`);
              }
              deletedCount++;
            }
          } else if (currentTable === 'users') {
            // 用户逐个删除
            for (const id of selectedIds) {
              const res = await homeFetch(`/api/user/${id}`, { method: 'DELETE' });
              if (res.code !== 0) {
                throw new Error(`删除用户失败: ${res.message}`);
              }
              deletedCount++;
            }
          } else if (currentTable === 'bookings') {
            // 预约逐个删除
            for (const id of selectedIds) {
              const res = await homeFetch(`/api/booking/${id}`, { method: 'DELETE' });
              if (res.code !== 0) {
                throw new Error(`删除预约失败: ${res.message}`);
              }
              deletedCount++;
            }
          } else {
            throw new Error(`未知的表类型: ${currentTable}`);
          }

          showToast(`成功删除 ${deletedCount} 条记录`, 'success');
          selectedIds = [];

          // 如果删除的是药材信息，清除药材信息缓存
          if (currentTable === 'herbs' && window._stockModule) {
            window._stockModule.clearHerbInfoCache();
          }

          loadTableData();
          loadStats();
        } catch (err) {
          showToast('批量删除失败: ' + err.message, 'error');
          loadTableData();
        }
      });
    } catch (err) {
      showConfirm('批量删除', `确定要删除选中的 ${selectedIds.length} 条记录吗？`, async () => {
        try {
          let deletedCount = 0;

          // 药材表使用专门的批量删除函数
          if (currentTable === 'herbs' && window._stockModule) {
            const result = await window._stockModule.handleHerbBatchDelete(selectedIds);
            if (!result.success) {
              throw new Error(result.error);
            }
            deletedCount = result.deletedCount;
          } else if (currentTable === 'prescriptions') {
            // 处方表使用专门的批量删除函数
            for (const id of selectedIds) {
              const res = await window._prescriptionModule.deletePrescription(id);
              if (res.code !== 0) {
                throw new Error(`删除处方失败: ${res.message}`);
              }
              deletedCount++;
            }
          } else if (currentTable === 'stock_in_orders' || currentTable === 'stock_out_orders') {
            // 入库单/执药单逐个删除（确保触发级联操作）
            for (const id of selectedIds) {
              const deleteApi = window._stockModule.getDeleteApiPath(id, currentTable);
              const res = await homeFetch(deleteApi, { method: 'DELETE' });
              if (res.code !== 0) {
                throw new Error(`删除${currentTable === 'stock_in_orders' ? '入库单' : '执药单'}失败: ${res.message}`);
              }
              deletedCount++;
            }
          } else if (currentTable === 'users') {
            // 用户逐个删除
            for (const id of selectedIds) {
              const res = await homeFetch(`/api/user/${id}`, { method: 'DELETE' });
              if (res.code !== 0) {
                throw new Error(`删除用户失败: ${res.message}`);
              }
              deletedCount++;
            }
          } else if (currentTable === 'bookings') {
            // 预约逐个删除
            for (const id of selectedIds) {
              const res = await homeFetch(`/api/booking/${id}`, { method: 'DELETE' });
              if (res.code !== 0) {
                throw new Error(`删除预约失败: ${res.message}`);
              }
              deletedCount++;
            }
          } else {
            throw new Error(`未知的表类型: ${currentTable}`);
          }

          showToast(`成功删除 ${deletedCount} 条记录`, 'success');
          selectedIds = [];

          // 如果删除的是药材信息，清除药材信息缓存
          if (currentTable === 'herbs' && window._stockModule) {
            window._stockModule.clearHerbInfoCache();
          }

          loadTableData();
          loadStats();
        } catch (err) {
          showToast('批量删除失败: ' + err.message, 'error');
          loadTableData();
        }
      });
    }
  } else {
    showConfirm('批量删除', `确定要删除选中的 ${selectedIds.length} 条记录吗？`, async () => {
      try {
        let deletedCount = 0;
        
        // 药材表使用专门的批量删除函数
        if (currentTable === 'herbs' && window._stockModule) {
          const result = await window._stockModule.handleHerbBatchDelete(selectedIds);
          if (!result.success) {
            throw new Error(result.error);
          }
          deletedCount = result.deletedCount;
        } else if (currentTable === 'prescriptions') {
          // 处方表使用专门的批量删除函数
          for (const id of selectedIds) {
            const res = await window._prescriptionModule.deletePrescription(id);
            if (res.code !== 0) {
              throw new Error(`删除处方失败: ${res.message}`);
            }
            deletedCount++;
          }
        } else if (currentTable === 'stock_in_orders' || currentTable === 'stock_out_orders') {
          // 入库单/执药单逐个删除（确保触发级联操作）
          for (const id of selectedIds) {
            const deleteApi = window._stockModule.getDeleteApiPath(id, currentTable);
            const res = await homeFetch(deleteApi, { method: 'DELETE' });
            if (res.code !== 0) {
              throw new Error(`删除${currentTable === 'stock_in_orders' ? '入库单' : '执药单'}失败: ${res.message}`);
            }
            deletedCount++;
          }
        } else if (currentTable === 'users') {
          // 用户逐个删除
          for (const id of selectedIds) {
            const res = await homeFetch(`/api/user/${id}`, { method: 'DELETE' });
            if (res.code !== 0) {
              throw new Error(`删除用户失败: ${res.message}`);
            }
            deletedCount++;
          }
        } else if (currentTable === 'bookings') {
          // 预约逐个删除
          for (const id of selectedIds) {
            const res = await homeFetch(`/api/booking/${id}`, { method: 'DELETE' });
            if (res.code !== 0) {
              throw new Error(`删除预约失败: ${res.message}`);
            }
            deletedCount++;
          }
        } else {
          throw new Error(`未知的表类型: ${currentTable}`);
        }

        showToast(`成功删除 ${deletedCount} 条记录`, 'success');
        selectedIds = [];
        
        // 如果删除的是药材信息，清除药材信息缓存
        if (currentTable === 'herbs' && window._stockModule) {
          window._stockModule.clearHerbInfoCache();
        }
        
        loadTableData();
        loadStats();
      } catch (err) {
        showToast('批量删除失败: ' + err.message, 'error');
        loadTableData();
      }
    });
  }
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
    const res = await homeFetch('/api/system/stats');
    if (res.code !== 0) return;

    const tables = res.data.tables;
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
    if (statusBar.hideTimer) clearTimeout(statusBar.hideTimer);
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

// 显示警告弹窗
function showAlert(title, message) {
  document.getElementById('confirmTitle').textContent = title;
  // 将顿号分隔的药材信息转为换行显示
  // 格式：以下药材库存不足：当归(...)、白芷(...)
  const colonIndex = message.indexOf('：');
  let lines;
  if (colonIndex !== -1) {
    const prefix = message.substring(0, colonIndex + 1);
    const items = message.substring(colonIndex + 1);
    lines = prefix + '<br>' + items.split('、').join('<br>');
  } else {
    lines = message.split('、').join('<br>');
  }
  document.getElementById('confirmMessage').innerHTML = lines;
  // 隐藏取消按钮
  const cancelBtn = document.querySelector('#confirmModal .modal-footer button:first-child');
  if (cancelBtn) cancelBtn.style.display = 'none';
  document.getElementById('confirmBtn').textContent = '确定';
  document.getElementById('confirmBtn').onclick = () => {
    closeConfirm();
    document.getElementById('confirmBtn').textContent = '确定';
    // 恢复取消按钮显示
    if (cancelBtn) cancelBtn.style.display = '';
  };
  document.getElementById('confirmModal').classList.add('show');
}

// ==================== 出诊管理 ====================

const WEEK_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const SESSION_LABELS = { morning: '上午', afternoon: '下午', evening: '晚上' };

async function renderSchedulePage() {
  const main = document.getElementById('main');
  main.innerHTML = `<div class="loading">加载中...</div>`;

  try {
    const res = await homeFetch('/api/schedule/config');
    if (res.code !== 0) throw new Error(res.message);

    const { defaults, overrides } = res.data;

    // 将 defaults 转为 map: dayOfWeek -> session -> record
    const defaultMap = {};
    defaults.forEach(d => {
      if (!defaultMap[d.dayOfWeek]) defaultMap[d.dayOfWeek] = {};
      defaultMap[d.dayOfWeek][d.session] = d;
    });

    main.innerHTML = `
      <div class="page-header">
        <div class="page-title">🗓️ 出诊管理</div>
      </div>

      <!-- 默认规则 -->
      <div class="schedule-section">
        <div class="schedule-section-title">默认出诊规则</div>
        <div class="schedule-section-desc">配置每周各场次的默认出诊状态</div>
        <div class="schedule-grid" id="defaultGrid">
          ${buildDefaultGrid(defaultMap)}
        </div>
      </div>

      <!-- 临时调整 -->
      <div class="schedule-section">
        <div class="schedule-section-title">临时调整</div>
        <div class="schedule-section-desc">为特定日期设置一次性的出诊/停诊覆盖</div>

        <!-- 添加新调整 -->
        <div class="override-form" id="overrideForm">
          <input type="date" id="overrideDate" class="schedule-input" min="${getTodayStr()}">
          <select id="overrideSession" class="schedule-select">
            <option value="morning">上午</option>
            <option value="afternoon">下午</option>
            <option value="evening">晚上</option>
            <option value="all">全天</option>
          </select>
          <select id="overrideIsOpen" class="schedule-select">
            <option value="open">出诊</option>
            <option value="closed">停诊</option>
          </select>
          <input type="text" id="overrideReason" class="schedule-input" placeholder="备注（可选）">
          <button class="btn btn-primary" onclick="addOverride()">添加</button>
        </div>

        <!-- 调整列表 -->
        <div id="overrideList">
          ${buildOverrideList(overrides)}
        </div>
      </div>
    `;
  } catch (err) {
    main.innerHTML = `<div class="empty-state"><div class="empty-icon">❌</div><p>${err.message}</p></div>`;
  }
}

function buildDefaultGrid(defaultMap) {
  let html = '';
  for (let day = 0; day <= 6; day++) {
    html += `<div class="schedule-day-card">`;
    html += `<div class="schedule-day-name">${WEEK_NAMES[day]}</div>`;
    for (const session of ['morning', 'afternoon', 'evening']) {
      const rec = defaultMap[day] && defaultMap[day][session];
      const isOpen = rec ? rec.isOpen : false;
      html += `
        <div class="schedule-session-row">
          <span class="schedule-session-label">${SESSION_LABELS[session]}</span>
          <button
            class="schedule-toggle-btn ${isOpen ? 'open' : 'closed'}"
            onclick="toggleDefaultSession(${day}, '${session}', this)"
            data-day="${day}"
            data-session="${session}"
            data-open="${isOpen ? '1' : '0'}"
          >${isOpen ? '出诊' : '停诊'}</button>
        </div>
      `;
    }
    html += `</div>`;
  }
  return html;
}

function buildOverrideList(overrides) {
  if (!overrides || overrides.length === 0) {
    return `<div class="schedule-empty">暂无临时调整</div>`;
  }
  let html = `<table class="schedule-override-table"><thead><tr>
    <th>日期</th><th>场次</th><th>状态</th><th>备注</th><th>操作</th>
  </tr></thead><tbody>`;
  overrides.forEach(o => {
    const sessionLabel = o.session === 'all' ? '全天' : (SESSION_LABELS[o.session] || o.session);
    html += `<tr data-override-id="${o.id}">
      <td>${o.date}</td>
      <td>${sessionLabel}</td>
      <td><span class="schedule-badge ${o.isOpen ? 'open' : 'closed'}">${o.isOpen ? '出诊' : '停诊'}</span></td>
      <td>${escapeHtml(o.reason || '-')}</td>
      <td><button class="action-btn action-btn-delete" onclick="deleteOverride(${o.id})">删除</button></td>
    </tr>`;
  });
  html += `</tbody></table>`;
  return html;
}

function getTodayStr() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

async function toggleDefaultSession(day, session, btn) {
  const currentOpen = btn.dataset.open === '1';
  const newOpen = !currentOpen;

  btn.disabled = true;
  try {
    const res = await homeFetch('/api/schedule/config/default', {
      method: 'POST',
      body: JSON.stringify({ dayOfWeek: day, session, isOpen: newOpen })
    });
    if (res.code !== 0) throw new Error(res.message);

    btn.dataset.open = newOpen ? '1' : '0';
    btn.className = `schedule-toggle-btn ${newOpen ? 'open' : 'closed'}`;
    btn.textContent = newOpen ? '出诊' : '停诊';
    showToast(`${WEEK_NAMES[day]} ${SESSION_LABELS[session]} 已设为「${newOpen ? '出诊' : '停诊'}」`, 'success');
  } catch (err) {
    showToast('保存失败: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

async function addOverride() {
  const date = document.getElementById('overrideDate').value;
  const session = document.getElementById('overrideSession').value;
  const isOpen = document.getElementById('overrideIsOpen').value === 'open';
  const reason = document.getElementById('overrideReason').value.trim();

  if (!date) {
    showToast('请选择日期', 'error');
    return;
  }

  try {
    const res = await homeFetch('/api/schedule/config/override', {
      method: 'POST',
      body: JSON.stringify({ date, session, isOpen, reason })
    });
    if (res.code !== 0) throw new Error(res.message);
    showToast('临时调整已保存', 'success');

    // 清空表单
    document.getElementById('overrideDate').value = '';
    document.getElementById('overrideReason').value = '';

    // 刷新列表
    reloadOverrideList();
  } catch (err) {
    showToast('保存失败: ' + err.message, 'error');
  }
}

async function deleteOverride(id) {
  showConfirm('确认删除', '确定要删除这条临时调整吗？', async () => {
    try {
      const res = await homeFetch(`/api/schedule/config/override/${id}`, { method: 'DELETE' });
      if (res.code !== 0) throw new Error(res.message);
      showToast('已删除', 'success');
      reloadOverrideList();
    } catch (err) {
      showToast('删除失败: ' + err.message, 'error');
    }
  });
}

async function reloadOverrideList() {
  const listEl = document.getElementById('overrideList');
  if (!listEl) return;
  listEl.innerHTML = '<div class="loading">加载中...</div>';
  try {
    const res = await homeFetch('/api/schedule/config');
    if (res.code !== 0) throw new Error(res.message);
    listEl.innerHTML = buildOverrideList(res.data.overrides);
  } catch (err) {
    listEl.innerHTML = `<div class="schedule-empty">加载失败: ${err.message}</div>`;
  }
}