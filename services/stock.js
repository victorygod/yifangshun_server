/**
 * 库存管理服务
 */

const {
  Herb,
  StockInOrder,
  StockInItem,
  StockOutOrder,
  StockOutItem,
  StockInventory,
  StockCheckOrder,
  StockCheckItem,
  StockLog,
  Op
} = require('../wrappers/db-wrapper');

// ========================================
// 工具函数
// ========================================

// 生成单号
function generateOrderNo(prefix) {
  const date = new Date();
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `${prefix}-${dateStr}-${random}`;
}

// 获取当前时间
function getNow() {
  return new Date().toISOString();
}

// 添加操作日志
async function addStockLog(action, orderNo, herbName, quantity, operator) {
  try {
    await StockLog.create({
      action,
      orderNo,
      herbName,
      quantity,
      operator,
      createdAt: getNow()
    });
  } catch (error) {
    console.error('添加操作日志失败:', error);
  }
}

// ========================================
// 药材管理
// ========================================

// 获取药材列表
async function getHerbs(options = {}) {
  const { keyword = '', page = 1, pageSize = 100 } = options;
  
  let where = {};
  if (keyword) {
    // 本地模式暂不支持模糊查询，返回全部
    // 后续可以优化
  }
  
  const herbs = await Herb.findAll({
    where,
    order: [['createdAt', 'DESC']]
  });
  
  // 过滤关键字
  let filtered = herbs;
  if (keyword) {
    filtered = herbs.filter(h => 
      h.name && h.name.includes(keyword) ||
      h.alias && h.alias.includes(keyword)
    );
  }
  
  return {
    code: 0,
    data: filtered
  };
}

// 创建药材
async function createHerb(data) {
  const { name, alias, unit = '克', minValue = 0, category } = data;
  
  if (!name) {
    throw new Error('药材名称不能为空');
  }
  
  // 检查是否已存在
  const existing = await Herb.findOne({ where: { name } });
  if (existing) {
    throw new Error('药材名称已存在');
  }
  
  const herb = await Herb.create({
    name,
    alias,
    unit,
    minValue,
    category,
    isActive: true,
    createdAt: getNow(),
    updatedAt: getNow()
  });
  
  // 同步创建库存记录
  await StockInventory.create({
    herbName: name,
    herbAlias: alias,
    quantity: 0,
    avgPrice: 0,
    minValue,
    updatedAt: getNow()
  });
  
  return {
    code: 0,
    message: '创建成功',
    data: herb
  };
}

// 更新药材
async function updateHerb(id, data) {
  const herb = await Herb.findByPk(id);
  if (!herb) {
    throw new Error('药材不存在');
  }
  
  const { name, alias, unit, minValue, category, isActive } = data;
  
  // 如果修改名称，检查是否与其他药材重名
  if (name && name !== herb.name) {
    const existing = await Herb.findOne({ where: { name } });
    if (existing) {
      throw new Error('药材名称已存在');
    }
  }
  
  const updates = {};
  if (name !== undefined) updates.name = name;
  if (alias !== undefined) updates.alias = alias;
  if (unit !== undefined) updates.unit = unit;
  if (minValue !== undefined) updates.minValue = minValue;
  if (category !== undefined) updates.category = category;
  if (isActive !== undefined) updates.isActive = isActive;
  updates.updatedAt = getNow();
  
  await Herb.update(updates, { where: { id } });
  
  // 同步更新库存记录
  if (name || alias || minValue !== undefined) {
    const invUpdates = {};
    if (name) invUpdates.herbName = name;
    if (alias) invUpdates.herbAlias = alias;
    if (minValue !== undefined) invUpdates.minValue = minValue;
    invUpdates.updatedAt = getNow();
    
    await StockInventory.update(invUpdates, { where: { herbName: herb.name } });
  }
  
  const updated = await Herb.findByPk(id);
  return {
    code: 0,
    message: '更新成功',
    data: updated
  };
}

// 删除药材
async function deleteHerb(id) {
  const herb = await Herb.findByPk(id);
  if (!herb) {
    throw new Error('药材不存在');
  }
  
  // 检查是否有库存
  const inventory = await StockInventory.findOne({ where: { herbName: herb.name } });
  if (inventory && inventory.quantity > 0) {
    throw new Error('该药材有库存，不能删除');
  }
  
  await Herb.destroy({ where: { id } });
  
  // 删除库存记录
  if (inventory) {
    await StockInventory.destroy({ where: { herbName: herb.name } });
  }
  
  return {
    code: 0,
    message: '删除成功'
  };
}

// ========================================
// 入库管理
// ========================================

// 获取入库单列表
async function getInOrders(options = {}) {
  const { status = 'all', page = 1, pageSize = 20 } = options;
  
  let where = {};
  if (status !== 'all') {
    where.status = status;
  }
  
  const orders = await StockInOrder.findAll({
    where,
    order: [['createdAt', 'DESC']]
  });
  
  // 分页
  const totalCount = orders.length;
  const totalPages = Math.ceil(totalCount / pageSize);
  const start = (page - 1) * pageSize;
  const pagedOrders = orders.slice(start, start + pageSize);
  
  // 获取每个订单的明细
  const ordersWithItems = await Promise.all(pagedOrders.map(async (order) => {
    const items = await StockInItem.findAll({ where: { orderId: order.id } });
    return {
      ...order,
      items
    };
  }));
  
  return {
    code: 0,
    data: ordersWithItems,
    pagination: {
      page,
      pageSize,
      totalCount,
      totalPages
    }
  };
}

// 获取入库单详情
async function getInOrderById(id) {
  const order = await StockInOrder.findByPk(id);
  if (!order) {
    throw new Error('入库单不存在');
  }
  
  const items = await StockInItem.findAll({ where: { orderId: id } });
  
  return {
    code: 0,
    data: {
      ...order,
      items
    }
  };
}

// 创建入库单（草稿）
async function createInOrder(data) {
  const { orderDate, supplierName, supplierPhone, supplierAddress, remark, items = [] } = data;
  
  if (!orderDate || !supplierName) {
    throw new Error('入库日期和供应商名称不能为空');
  }
  
  const orderNo = generateOrderNo('RK');
  
  // 计算总金额
  let totalAmount = 0;
  items.forEach(item => {
    totalAmount += (item.quantity || 0) * (item.unitPrice || 0);
  });
  
  const order = await StockInOrder.create({
    orderNo,
    orderDate,
    supplierName,
    supplierPhone,
    supplierAddress,
    status: 'draft',
    remark,
    totalAmount,
    createdAt: getNow(),
    updatedAt: getNow()
  });
  
  // 创建明细
  for (const item of items) {
    await StockInItem.create({
      orderId: order.id,
      herbName: item.herbName,
      herbAlias: item.herbAlias,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      totalPrice: (item.quantity || 0) * (item.unitPrice || 0),
      remark: item.remark
    });
  }
  
  const created = await getInOrderById(order.id);
  return {
    code: 0,
    message: '创建成功',
    data: created.data
  };
}

// 更新入库单
async function updateInOrder(id, data) {
  const order = await StockInOrder.findByPk(id);
  if (!order) {
    throw new Error('入库单不存在');
  }
  
  if (order.status !== 'draft') {
    throw new Error('只有草稿状态的入库单可以修改');
  }
  
  const { orderDate, supplierName, supplierPhone, supplierAddress, remark, items } = data;
  
  const updates = {};
  if (orderDate !== undefined) updates.orderDate = orderDate;
  if (supplierName !== undefined) updates.supplierName = supplierName;
  if (supplierPhone !== undefined) updates.supplierPhone = supplierPhone;
  if (supplierAddress !== undefined) updates.supplierAddress = supplierAddress;
  if (remark !== undefined) updates.remark = remark;
  updates.updatedAt = getNow();
  
  // 如果有明细更新
  if (items !== undefined) {
    let totalAmount = 0;
    items.forEach(item => {
      totalAmount += (item.quantity || 0) * (item.unitPrice || 0);
    });
    updates.totalAmount = totalAmount;
  }
  
  await StockInOrder.update(updates, { where: { id } });
  
  // 更新明细
  if (items !== undefined) {
    // 删除旧明细
    await StockInItem.destroy({ where: { orderId: id } });
    
    // 创建新明细
    for (const item of items) {
      await StockInItem.create({
        orderId: id,
        herbName: item.herbName,
        herbAlias: item.herbAlias,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: (item.quantity || 0) * (item.unitPrice || 0),
        remark: item.remark
      });
    }
  }
  
  const updated = await getInOrderById(id);
  return {
    code: 0,
    message: '更新成功',
    data: updated.data
  };
}

// 删除入库单
async function deleteInOrder(id) {
  const order = await StockInOrder.findByPk(id);
  if (!order) {
    throw new Error('入库单不存在');
  }
  
  if (order.status === 'stocked') {
    throw new Error('已入库的单据不能删除');
  }
  
  // 删除明细
  await StockInItem.destroy({ where: { orderId: id } });
  
  // 删除主表
  await StockInOrder.destroy({ where: { id } });
  
  return {
    code: 0,
    message: '删除成功'
  };
}

// 确认入库单
async function confirmInOrder(id) {
  const order = await StockInOrder.findByPk(id);
  if (!order) {
    throw new Error('入库单不存在');
  }
  
  if (order.status !== 'draft') {
    throw new Error('只有草稿状态可以确认');
  }
  
  await StockInOrder.update({ status: 'confirmed', updatedAt: getNow() }, { where: { id } });
  
  const updated = await getInOrderById(id);
  return {
    code: 0,
    message: '确认成功',
    data: updated.data
  };
}

// 执行入库（更新库存）
async function executeStockIn(id, operator = 'system') {
  const order = await StockInOrder.findByPk(id);
  if (!order) {
    throw new Error('入库单不存在');
  }
  
  if (order.status !== 'confirmed') {
    throw new Error('只有已确认状态可以入库');
  }
  
  // 获取明细
  const items = await StockInItem.findAll({ where: { orderId: id } });
  
  // 更新库存
  for (const item of items) {
    let inventory = await StockInventory.findOne({ where: { herbName: item.herbName } });
    
    if (!inventory) {
      // 创建库存记录
      inventory = await StockInventory.create({
        herbName: item.herbName,
        herbAlias: item.herbAlias,
        quantity: item.quantity,
        avgPrice: item.unitPrice,
        minValue: 0,
        lastStockInDate: order.orderDate,
        updatedAt: getNow()
      });
    } else {
      // 更新库存（加权平均价格）
      const oldQuantity = inventory.quantity || 0;
      const oldAvgPrice = inventory.avgPrice || 0;
      const newQuantity = oldQuantity + item.quantity;
      const newAvgPrice = newQuantity > 0 
        ? ((oldQuantity * oldAvgPrice) + (item.quantity * item.unitPrice)) / newQuantity 
        : 0;
      
      await StockInventory.update({
        quantity: newQuantity,
        avgPrice: newAvgPrice,
        lastStockInDate: order.orderDate,
        updatedAt: getNow()
      }, { where: { id: inventory.id } });
      
      // 添加日志
      await addStockLog('stock_in', order.orderNo, item.herbName, item.quantity, operator);
    }
    
    // 添加日志
    await addStockLog('stock_in', order.orderNo, item.herbName, item.quantity, operator);
  }
  
  // 更新订单状态
  await StockInOrder.update({ status: 'stocked', updatedAt: getNow() }, { where: { id } });
  
  const updated = await getInOrderById(id);
  return {
    code: 0,
    message: '入库成功',
    data: updated.data
  };
}

// ========================================
// 出库管理
// ========================================

// 获取出库单列表
async function getOutOrders(options = {}) {
  const { orderType = 'all', page = 1, pageSize = 20 } = options;
  
  let where = {};
  if (orderType !== 'all') {
    where.orderType = orderType;
  }
  
  const orders = await StockOutOrder.findAll({
    where,
    order: [['createdAt', 'DESC']]
  });
  
  // 分页
  const totalCount = orders.length;
  const totalPages = Math.ceil(totalCount / pageSize);
  const start = (page - 1) * pageSize;
  const pagedOrders = orders.slice(start, start + pageSize);
  
  // 获取每个订单的明细
  const ordersWithItems = await Promise.all(pagedOrders.map(async (order) => {
    const items = await StockOutItem.findAll({ where: { orderId: order.id } });
    return {
      ...order,
      items
    };
  }));
  
  return {
    code: 0,
    data: ordersWithItems,
    pagination: {
      page,
      pageSize,
      totalCount,
      totalPages
    }
  };
}

// 创建出库单（手动出库）
async function createOutOrder(data, operator = 'system') {
  const { orderDate, orderType = 'manual', settlementOrderNo, remark, items = [] } = data;
  
  if (!orderDate || items.length === 0) {
    throw new Error('出库日期和明细不能为空');
  }
  
  // 检查库存是否足够
  for (const item of items) {
    const inventory = await StockInventory.findOne({ where: { herbName: item.herbName } });
    if (!inventory || inventory.quantity < item.quantity) {
      throw new Error(`药材 ${item.herbName} 库存不足`);
    }
  }
  
  const orderNo = generateOrderNo('CK');
  
  // 计算总金额
  let totalAmount = 0;
  for (const item of items) {
    // 获取当前库存均价作为出库单价
    const inventory = await StockInventory.findOne({ where: { herbName: item.herbName } });
    const unitPrice = inventory ? inventory.avgPrice : 0;
    totalAmount += item.quantity * unitPrice;
  }
  
  const order = await StockOutOrder.create({
    orderNo,
    orderDate,
    orderType,
    settlementOrderNo,
    operator,
    remark,
    totalAmount,
    createdAt: getNow()
  });
  
  // 创建明细并扣减库存
  for (const item of items) {
    const inventory = await StockInventory.findOne({ where: { herbName: item.herbName } });
    const unitPrice = inventory ? inventory.avgPrice : 0;
    
    await StockOutItem.create({
      orderId: order.id,
      herbName: item.herbName,
      quantity: item.quantity,
      unitPrice,
      totalPrice: item.quantity * unitPrice,
      remark: item.remark
    });
    
    // 扣减库存
    const newQuantity = inventory.quantity - item.quantity;
    await StockInventory.update({
      quantity: newQuantity,
      lastStockOutDate: orderDate,
      updatedAt: getNow()
    }, { where: { id: inventory.id } });
    
    // 添加日志
    await addStockLog('stock_out', orderNo, item.herbName, -item.quantity, operator);
  }
  
  const created = await getOutOrderById(order.id);
  return {
    code: 0,
    message: '出库成功',
    data: created
  };
}

// 获取出库单详情
async function getOutOrderById(id) {
  const order = await StockOutOrder.findByPk(id);
  if (!order) {
    throw new Error('出库单不存在');
  }
  
  const items = await StockOutItem.findAll({ where: { orderId: id } });
  
  return {
    ...order,
    items
  };
}

// 删除出库单
async function deleteOutOrder(id) {
  const order = await StockOutOrder.findByPk(id);
  if (!order) {
    throw new Error('出库单不存在');
  }
  
  if (order.orderType !== 'manual') {
    throw new Error('只有手动出库单可以删除');
  }
  
  // 获取明细，恢复库存
  const items = await StockOutItem.findAll({ where: { orderId: id } });
  for (const item of items) {
    const inventory = await StockInventory.findOne({ where: { herbName: item.herbName } });
    if (inventory) {
      const newQuantity = inventory.quantity + item.quantity;
      await StockInventory.update({ quantity: newQuantity, updatedAt: getNow() }, { where: { id: inventory.id } });
    }
  }
  
  // 删除明细
  await StockOutItem.destroy({ where: { orderId: id } });
  
  // 删除主表
  await StockOutOrder.destroy({ where: { id } });
  
  return {
    code: 0,
    message: '删除成功'
  };
}

// ========================================
// 库存统计
// ========================================

// 获取库存列表
async function getInventory(options = {}) {
  const { keyword = '', alert = false, page = 1, pageSize = 50 } = options;
  
  let inventory = await StockInventory.findAll({
    order: [['herbName', 'ASC']]
  });
  
  // 过滤关键字
  if (keyword) {
    inventory = inventory.filter(item => 
      item.herbName && item.herbName.includes(keyword) ||
      item.herbAlias && item.herbAlias.includes(keyword)
    );
  }
  
  // 过滤预警
  if (alert) {
    inventory = inventory.filter(item => {
      const minVal = item.minValue || 0;
      return item.quantity <= minVal;
    });
  }
  
  // 计算库存价值
  const inventoryWithValue = inventory.map(item => ({
    ...item,
    inventoryValue: (item.quantity || 0) * (item.avgPrice || 0),
    alertStatus: (item.quantity || 0) <= (item.minValue || 0) 
      ? ((item.quantity || 0) <= 0 ? '缺货' : '低库存') 
      : '正常'
  }));
  
  return {
    code: 0,
    data: inventoryWithValue
  };
}

// 获取库存预警列表
async function getInventoryAlert() {
  const result = await getInventory({ alert: true });
  return result;
}

// 设置最低库存阈值
async function setHerbMinValue(herbName, minValue) {
  const inventory = await StockInventory.findOne({ where: { herbName } });
  if (!inventory) {
    throw new Error('药材库存记录不存在');
  }
  
  await StockInventory.update({ minValue, updatedAt: getNow() }, { where: { herbName } });
  
  // 同步更新药材表
  await Herb.update({ minValue, updatedAt: getNow() }, { where: { name: herbName } });
  
  return {
    code: 0,
    message: '设置成功'
  };
}

// 获取药材出入库历史
async function getHerbHistory(herbName, options = {}) {
  const { page = 1, pageSize = 20 } = options;
  
  const logs = await StockLog.findAll({
    where: { herbName },
    order: [['createdAt', 'DESC']]
  });
  
  const totalCount = logs.length;
  const totalPages = Math.ceil(totalCount / pageSize);
  const start = (page - 1) * pageSize;
  const pagedLogs = logs.slice(start, start + pageSize);
  
  return {
    code: 0,
    data: pagedLogs,
    pagination: {
      page,
      pageSize,
      totalCount,
      totalPages
    }
  };
}

// ========================================
// 盘点管理
// ========================================

// 获取盘点单列表
async function getCheckOrders(options = {}) {
  const { status = 'all', page = 1, pageSize = 20 } = options;
  
  let where = {};
  if (status !== 'all') {
    where.status = status;
  }
  
  const orders = await StockCheckOrder.findAll({
    where,
    order: [['createdAt', 'DESC']]
  });
  
  // 分页
  const totalCount = orders.length;
  const totalPages = Math.ceil(totalCount / pageSize);
  const start = (page - 1) * pageSize;
  const pagedOrders = orders.slice(start, start + pageSize);
  
  // 获取每个订单的明细
  const ordersWithItems = await Promise.all(pagedOrders.map(async (order) => {
    const items = await StockCheckItem.findAll({ where: { checkId: order.id } });
    return {
      ...order,
      items
    };
  }));
  
  return {
    code: 0,
    data: ordersWithItems,
    pagination: {
      page,
      pageSize,
      totalCount,
      totalPages
    }
  };
}

// 创建盘点单
async function createCheckOrder(data) {
  const { checkDate, checker, remark, items = [] } = data;
  
  if (!checkDate || !checker || items.length === 0) {
    throw new Error('盘点日期、盘点人和明细不能为空');
  }
  
  const checkNo = generateOrderNo('PD');
  
  const order = await StockCheckOrder.create({
    checkNo,
    checkDate,
    checker,
    status: 'draft',
    remark,
    createdAt: getNow()
  });
  
  // 创建明细
  for (const item of items) {
    // 获取系统库存
    const inventory = await StockInventory.findOne({ where: { herbName: item.herbName } });
    const systemQuantity = inventory ? inventory.quantity : 0;
    const actualQuantity = item.actualQuantity || 0;
    
    await StockCheckItem.create({
      checkId: order.id,
      herbName: item.herbName,
      systemQuantity,
      actualQuantity,
      difference: actualQuantity - systemQuantity
    });
  }
  
  const created = await getCheckOrderById(order.id);
  return {
    code: 0,
    message: '创建成功',
    data: created
  };
}

// 获取盘点单详情
async function getCheckOrderById(id) {
  const order = await StockCheckOrder.findByPk(id);
  if (!order) {
    throw new Error('盘点单不存在');
  }
  
  const items = await StockCheckItem.findAll({ where: { checkId: id } });
  
  return {
    ...order,
    items
  };
}

// 确认盘点（调整库存）
async function confirmCheckOrder(id, operator = 'system') {
  const order = await StockCheckOrder.findByPk(id);
  if (!order) {
    throw new Error('盘点单不存在');
  }
  
  if (order.status !== 'draft') {
    throw new Error('只有草稿状态可以确认');
  }
  
  // 获取明细
  const items = await StockCheckItem.findAll({ where: { checkId: id } });
  
  // 调整库存
  for (const item of items) {
    const inventory = await StockInventory.findOne({ where: { herbName: item.herbName } });
    
    if (inventory) {
      await StockInventory.update({
        quantity: item.actualQuantity,
        updatedAt: getNow()
      }, { where: { id: inventory.id } });
      
      // 添加日志
      await addStockLog('check', order.checkNo, item.herbName, item.difference, operator);
    }
  }
  
  // 更新状态
  await StockCheckOrder.update({ status: 'confirmed', updatedAt: getNow() }, { where: { id } });
  
  const updated = await getCheckOrderById(id);
  return {
    code: 0,
    message: '盘点确认成功',
    data: updated
  };
}

// ========================================
// 导出
// ========================================

module.exports = {
  // 药材管理
  getHerbs,
  createHerb,
  updateHerb,
  deleteHerb,
  
  // 入库管理
  getInOrders,
  getInOrderById,
  createInOrder,
  updateInOrder,
  deleteInOrder,
  confirmInOrder,
  executeStockIn,
  
  // 出库管理
  getOutOrders,
  getOutOrderById,
  createOutOrder,
  deleteOutOrder,
  
  // 库存统计
  getInventory,
  getInventoryAlert,
  setHerbMinValue,
  getHerbHistory,
  
  // 盘点管理
  getCheckOrders,
  getCheckOrderById,
  createCheckOrder,
  confirmCheckOrder
};
