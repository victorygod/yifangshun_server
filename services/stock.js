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
  StockLog,
  Prescription,
  Op
} = require('../wrappers/db-wrapper');

// ========================================
// 工具函数
// ========================================

// 将Sequelize实例或普通对象转换为纯对象
function toPlainObject(obj) {
  if (!obj) return obj;
  // Sequelize实例有toJSON方法
  if (typeof obj.toJSON === 'function') {
    return obj.toJSON();
  }
  // 普通对象直接返回
  return obj;
}

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
  const { name, alias, unit = '克', minValue = 0, category, cabinetNo, salePrice, remark } = data;
  
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
    cabinetNo,
    salePrice,
    remark,
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
  const herb = await Herb.findOne({ where: { id } });
  if (!herb) {
    throw new Error('药材不存在');
  }
  
  const { name, alias, unit, minValue, category, isActive, cabinetNo, salePrice, remark } = data;
  
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
  if (cabinetNo !== undefined) updates.cabinetNo = cabinetNo;
  if (salePrice !== undefined) updates.salePrice = salePrice;
  if (remark !== undefined) updates.remark = remark;
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
  
  const updated = await Herb.findOne({ where: { id } });
  return {
    code: 0,
    message: '更新成功',
    data: updated
  };
}

// 删除药材
async function deleteHerb(id) {
  const herb = await Herb.findOne({ where: { id } });
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
  // 确保参数为数字类型
  const page = parseInt(options.page) || 1;
  const pageSize = parseInt(options.pageSize) || 20;
  const status = options.status || 'all';
  
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
  
  // 获取每个订单的明细（使用宽松比较匹配orderId）
  const allItems = await StockInItem.findAll();
  const ordersWithItems = await Promise.all(pagedOrders.map(async (order) => {
    const items = allItems.filter(item => item.orderId == order.id);
    return {
      ...toPlainObject(order),
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
  const order = await StockInOrder.findOne({ where: { id } });
  if (!order) {
    throw new Error('入库单不存在');
  }
  
  const items = await StockInItem.findAll({ where: { orderId: id } });
  
  return {
    code: 0,
    data: {
      ...toPlainObject(order),
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
  const order = await StockInOrder.findOne({ where: { id } });
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
  const order = await StockInOrder.findOne({ where: { id } });
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
  const order = await StockInOrder.findOne({ where: { id } });
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
  const order = await StockInOrder.findOne({ where: { id } });
  if (!order) {
    throw new Error('入库单不存在');
  }
  
  // 获取明细 - 使用宽松比较匹配orderId（可能是字符串或数字）
  const allItems = await StockInItem.findAll();
  const items = allItems.filter(item => item.orderId == id);
  
  console.log(`[executeStockIn] 入库单ID: ${id}, 找到明细: ${items.length} 条`);
  
  if (items.length === 0) {
    throw new Error('入库单没有明细');
  }
  
  // 更新库存
  for (const item of items) {
    const itemQuantity = parseFloat(item.quantity) || 0;
    const itemUnitPrice = parseFloat(item.unitPrice) || 0;
    
    // 先检查药材是否存在，不存在则创建
    let herb = await Herb.findOne({ where: { name: item.herbName } });
    if (!herb) {
      // 自动创建药材信息
      herb = await Herb.create({
        name: item.herbName,
        alias: '',
        unit: '克',
        minValue: 0,
        salePrice: itemUnitPrice, // 默认使用进货单价作为售价
        stock: itemQuantity, // 初始库存
        isActive: true,
        createdAt: getNow(),
        updatedAt: getNow()
      });
      console.log(`[executeStockIn] 自动创建药材: ${item.herbName}, 初始库存: ${itemQuantity}`);
    } else {
      // 更新药材表的库存
      const oldStock = parseFloat(herb.stock) || 0;
      const newStock = oldStock + itemQuantity;
      await Herb.update({ stock: newStock, updatedAt: getNow() }, { where: { id: herb.id } });
      console.log(`[executeStockIn] 更新药材库存: ${item.herbName}, 旧库存: ${oldStock}, 新库存: ${newStock}`);
    }
    
    let inventory = await StockInventory.findOne({ where: { herbName: item.herbName } });
    
    if (!inventory) {
      // 创建库存记录
      inventory = await StockInventory.create({
        herbName: item.herbName,
        herbAlias: item.herbAlias || '',
        quantity: itemQuantity,
        avgPrice: itemUnitPrice,
        minValue: 0,
        lastStockInDate: order.orderDate,
        updatedAt: getNow()
      });
      console.log(`[executeStockIn] 创建库存记录: ${item.herbName}, 数量: ${itemQuantity}`);
    } else {
      // 更新库存（加权平均价格）
      const oldQuantity = parseFloat(inventory.quantity) || 0;
      const oldAvgPrice = parseFloat(inventory.avgPrice) || 0;
      const newQuantity = oldQuantity + itemQuantity;
      const newAvgPrice = newQuantity > 0 
        ? ((oldQuantity * oldAvgPrice) + (itemQuantity * itemUnitPrice)) / newQuantity 
        : 0;
      
      await StockInventory.update({
        quantity: newQuantity,
        avgPrice: newAvgPrice,
        lastStockInDate: order.orderDate,
        updatedAt: getNow()
      }, { where: { id: inventory.id } });
      console.log(`[executeStockIn] 更新库存统计: ${item.herbName}, 旧数量: ${oldQuantity}, 新数量: ${newQuantity}`);
    }
    
    // 添加日志
    await addStockLog('stock_in', order.orderNo || `RK-${id}`, item.herbName, itemQuantity, operator);
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

// 回退入库（从库存中扣除）
async function revertStockIn(id, operator = 'system') {
  const order = await StockInOrder.findOne({ where: { id } });
  if (!order) {
    throw new Error('入库单不存在');
  }
  
  // 获取明细 - 使用宽松比较匹配orderId（可能是字符串或数字）
  const allItems = await StockInItem.findAll();
  const items = allItems.filter(item => item.orderId == id);
  
  console.log(`[revertStockIn] 入库单ID: ${id}, 找到明细: ${items.length} 条`);
  
  // 回退库存
  for (const item of items) {
    const itemQuantity = parseFloat(item.quantity) || 0;
    
    // 更新药材表的库存
    let herb = await Herb.findOne({ where: { name: item.herbName } });
    if (herb) {
      const oldStock = parseFloat(herb.stock) || 0;
      const newStock = Math.max(0, oldStock - itemQuantity);
      await Herb.update({ stock: newStock, updatedAt: getNow() }, { where: { id: herb.id } });
      console.log(`[revertStockIn] 回退药材库存: ${item.herbName}, 旧库存: ${oldStock}, 新库存: ${newStock}`);
    }
    
    // 更新库存统计表
    let inventory = await StockInventory.findOne({ where: { herbName: item.herbName } });
    if (inventory) {
      const oldQuantity = parseFloat(inventory.quantity) || 0;
      const newQuantity = Math.max(0, oldQuantity - itemQuantity);
      await StockInventory.update({
        quantity: newQuantity,
        updatedAt: getNow()
      }, { where: { id: inventory.id } });
      console.log(`[revertStockIn] 回退库存统计: ${item.herbName}, 旧数量: ${oldQuantity}, 新数量: ${newQuantity}`);
    }
    
    // 添加日志
    await addStockLog('revert_in', order.orderNo || `RK-${id}`, item.herbName, -itemQuantity, operator);
  }
  
  return {
    code: 0,
    message: '回退成功'
  };
}

// 执行执药（扣减库存）
async function executeStockOut(id, operator = 'system') {
  const order = await StockOutOrder.findOne({ where: { id } });
  if (!order) {
    throw new Error('执药单不存在');
  }
  
  // 获取明细 - 使用宽松比较匹配orderId
  const allItems = await StockOutItem.findAll();
  const items = allItems.filter(item => item.orderId == id);
  
  console.log(`[executeStockOut] 执药单ID: ${id}, 找到明细: ${items.length} 条`);
  
  // 扣减库存
  for (const item of items) {
    const itemQuantity = parseFloat(item.quantity) || 0;
    
    // 更新药材表的库存
    let herb = await Herb.findOne({ where: { name: item.herbName } });
    if (herb) {
      const oldStock = parseFloat(herb.stock) || 0;
      const newStock = Math.max(0, oldStock - itemQuantity);
      await Herb.update({ stock: newStock, updatedAt: getNow() }, { where: { id: herb.id } });
      console.log(`[executeStockOut] 扣减药材库存: ${item.herbName}, 旧库存: ${oldStock}, 新库存: ${newStock}`);
    }
    
    // 更新库存统计表
    let inventory = await StockInventory.findOne({ where: { herbName: item.herbName } });
    if (inventory) {
      const oldQuantity = parseFloat(inventory.quantity) || 0;
      const newQuantity = Math.max(0, oldQuantity - itemQuantity);
      await StockInventory.update({
        quantity: newQuantity,
        updatedAt: getNow()
      }, { where: { id: inventory.id } });
      console.log(`[executeStockOut] 扣减库存统计: ${item.herbName}, 旧数量: ${oldQuantity}, 新数量: ${newQuantity}`);
    }
    
    // 添加日志
    await addStockLog('stock_out', `ZD-${id}`, item.herbName, -itemQuantity, operator);
  }
  
  return {
    code: 0,
    message: '执药成功'
  };
}

// 回滚执药（恢复库存）
async function revertStockOut(id, operator = 'system') {
  const order = await StockOutOrder.findOne({ where: { id } });
  if (!order) {
    throw new Error('执药单不存在');
  }
  
  // 获取明细 - 使用宽松比较匹配orderId
  const allItems = await StockOutItem.findAll();
  const items = allItems.filter(item => item.orderId == id);
  
  console.log(`[revertStockOut] 执药单ID: ${id}, 找到明细: ${items.length} 条`);
  
  // 恢复库存
  for (const item of items) {
    const itemQuantity = parseFloat(item.quantity) || 0;
    
    // 更新药材表的库存
    let herb = await Herb.findOne({ where: { name: item.herbName } });
    if (herb) {
      const oldStock = parseFloat(herb.stock) || 0;
      const newStock = oldStock + itemQuantity;
      await Herb.update({ stock: newStock, updatedAt: getNow() }, { where: { id: herb.id } });
      console.log(`[revertStockOut] 恢复药材库存: ${item.herbName}, 旧库存: ${oldStock}, 新库存: ${newStock}`);
    }
    
    // 更新库存统计表
    let inventory = await StockInventory.findOne({ where: { herbName: item.herbName } });
    if (inventory) {
      const oldQuantity = parseFloat(inventory.quantity) || 0;
      const newQuantity = oldQuantity + itemQuantity;
      await StockInventory.update({
        quantity: newQuantity,
        updatedAt: getNow()
      }, { where: { id: inventory.id } });
      console.log(`[revertStockOut] 恢复库存统计: ${item.herbName}, 旧数量: ${oldQuantity}, 新数量: ${newQuantity}`);
    }
    
    // 添加日志
    await addStockLog('revert_out', `ZD-${id}`, item.herbName, itemQuantity, operator);
  }
  
  return {
    code: 0,
    message: '回滚成功'
  };
}

// ========================================
// 出库管理（执药单）
// ========================================

// 更新执药单总价（根据明细汇总）
async function updateOutOrderTotalAmount(orderId) {
  try {
    const items = await StockOutItem.findAll({ where: { orderId } });
    let totalPrice = 0;
    items.forEach(item => {
      totalPrice += parseFloat(item.totalPrice) || 0;
    });
    await StockOutOrder.update({ totalPrice, updatedAt: getNow() }, { where: { id: orderId } });
    return totalPrice;
  } catch (error) {
    console.error('更新执药单总价失败:', error);
    return 0;
  }
}

// 获取执药单列表
async function getOutOrders(options = {}) {
  // 确保参数为数字类型
  const page = parseInt(options.page) || 1;
  const pageSize = parseInt(options.pageSize) || 20;
  const status = options.status || 'all';
  
  let where = {};
  if (status !== 'all') {
    where.status = status;
  }
  
  const orders = await StockOutOrder.findAll({
    where,
    order: [['prescriptionTime', 'DESC'], ['createdAt', 'DESC']]
  });
  
  // 分页
  const totalCount = orders.length;
  const totalPages = Math.ceil(totalCount / pageSize);
  const start = (page - 1) * pageSize;
  const pagedOrders = orders.slice(start, start + pageSize);
  
  // 获取每个订单的明细（使用宽松比较匹配orderId）
  const allItems = await StockOutItem.findAll();
  const ordersWithItems = await Promise.all(pagedOrders.map(async (order) => {
    let items = allItems.filter(item => item.orderId == order.id);
    
    // 待执药状态：自动同步药材单价
    if (order.status === 'pending' && items.length > 0) {
      let needUpdateTotal = false;
      for (const item of items) {
        const herb = await Herb.findOne({ where: { name: item.herbName } });
        if (herb && herb.salePrice != null && parseFloat(herb.salePrice) !== parseFloat(item.unitPrice)) {
          const newUnitPrice = parseFloat(herb.salePrice);
          const newTotalPrice = parseFloat(item.quantity) * newUnitPrice;
          await StockOutItem.update(
            { unitPrice: newUnitPrice, totalPrice: newTotalPrice, updatedAt: getNow() },
            { where: { id: item.id } }
          );
          item.unitPrice = newUnitPrice;
          item.totalPrice = newTotalPrice;
          needUpdateTotal = true;
        }
      }
      // 更新执药单总价
      if (needUpdateTotal) {
        const newTotal = await updateOutOrderTotalAmount(order.id);
        order.totalPrice = newTotal;
      }
    }
    
    return {
      ...toPlainObject(order),
      items: items.map(toPlainObject)
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

// 创建执药单（从处方导入）
async function createOutOrder(data, operator = 'system') {
  const { prescriptionId, prescriptionTime, pharmacist, reviewer, remark, items = [] } = data;
  
  if (items.length === 0) {
    throw new Error('明细不能为空');
  }
  
  if (!prescriptionId) {
    throw new Error('处方ID不能为空');
  }
  
  // 检查处方是否已创建执药单
  const existing = await StockOutOrder.findOne({ where: { prescriptionId } });
  if (existing) {
    throw new Error('该处方已创建执药单');
  }
  
  // 计算总金额
  let totalPrice = 0;
  for (const item of items) {
    // 获取药材售价
    const herb = await Herb.findOne({ where: { name: item.herbName } });
    const unitPrice = herb ? parseFloat(herb.salePrice) || 0 : 0;
    totalPrice += parseFloat(item.quantity) * unitPrice;
  }
  
  const order = await StockOutOrder.create({
    prescriptionId,
    prescriptionTime: prescriptionTime || getNow(),
    pharmacist,
    reviewer,
    status: 'pending',
    remark,
    totalPrice,
    createdAt: getNow(),
    updatedAt: getNow()
  });
  
  // 创建明细
  for (const item of items) {
    const herb = await Herb.findOne({ where: { name: item.herbName } });
    const unitPrice = herb ? parseFloat(herb.salePrice) || 0 : 0;
    const quantity = parseFloat(item.quantity) || 0;
    
    await StockOutItem.create({
      orderId: order.id,
      herbName: item.herbName,
      quantity,
      unitPrice,
      totalPrice: quantity * unitPrice,
      createdAt: getNow()
    });
    
    // 添加日志
    await addStockLog('stock_out', `ZD-${prescriptionId}`, item.herbName, quantity, operator);
  }
  
  const created = await getOutOrderById(order.id);
  return {
    code: 0,
    message: '创建成功',
    data: created
  };
}

// 获取出库单详情
async function getOutOrderById(id) {
  const order = await StockOutOrder.findOne({ where: { id } });
  if (!order) {
    throw new Error('出库单不存在');
  }
  
  const items = await StockOutItem.findAll({ where: { orderId: id } });
  
  // 待执药状态：自动同步药材单价
  if (order.status === 'pending' && items.length > 0) {
    let needUpdateTotal = false;
    for (const item of items) {
      const herb = await Herb.findOne({ where: { name: item.herbName } });
      if (herb && herb.salePrice != null && parseFloat(herb.salePrice) !== parseFloat(item.unitPrice)) {
        const newUnitPrice = parseFloat(herb.salePrice);
        const newTotalPrice = parseFloat(item.quantity) * newUnitPrice;
        await StockOutItem.update(
          { unitPrice: newUnitPrice, totalPrice: newTotalPrice, updatedAt: getNow() },
          { where: { id: item.id } }
        );
        item.unitPrice = newUnitPrice;
        item.totalPrice = newTotalPrice;
        needUpdateTotal = true;
        console.log(`[getOutOrderById] 同步药材单价: ${item.herbName}, ${item.unitPrice} -> ${newUnitPrice}`);
      }
    }
    // 更新执药单总价
    if (needUpdateTotal) {
      const newTotal = await updateOutOrderTotalAmount(id);
      order.totalPrice = newTotal;
    }
  }
  
  return {
    ...toPlainObject(order),
    items: items.map(toPlainObject)
  };
}

// 删除出库单
async function deleteOutOrder(id) {
  const order = await StockOutOrder.findOne({ where: { id } });
  if (!order) {
    throw new Error('执药单不存在');
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

// 撤销执药（回滚库存）
async function revertOutOrder(id, operator = 'system') {
  const order = await StockOutOrder.findOne({ where: { id } });
  if (!order) {
    throw new Error('执药单不存在');
  }
  
  if (order.status !== 'pending') {
    throw new Error('只有待执药状态可以撤销');
  }
  
  // 获取明细，恢复库存
  const items = await StockOutItem.findAll({ where: { orderId: id } });
  for (const item of items) {
    const itemQuantity = parseFloat(item.quantity) || 0;
    
    const inventory = await StockInventory.findOne({ where: { herbName: item.herbName } });
    if (inventory) {
      const oldQuantity = parseFloat(inventory.quantity) || 0;
      const newQuantity = oldQuantity + itemQuantity;
      await StockInventory.update({ quantity: newQuantity, updatedAt: getNow() }, { where: { id: inventory.id } });
    }
    
    // 添加日志
    await addStockLog('revert', `ZD-${order.prescriptionId}`, item.herbName, itemQuantity, operator);
  }
  
  // 删除明细
  await StockOutItem.destroy({ where: { orderId: id } });
  
  // 删除主表
  await StockOutOrder.destroy({ where: { id } });
  
  return {
    code: 0,
    message: '撤销成功'
  };
}

// 结算执药单
async function settleOutOrder(id) {
  const order = await StockOutOrder.findOne({ where: { id } });
  if (!order) {
    throw new Error('执药单不存在');
  }
  
  if (order.status !== 'pending') {
    throw new Error('只有待执药状态可以结算');
  }
  
  // 获取明细 - 使用宽松比较匹配orderId（可能是字符串或数字）
  const allItems = await StockOutItem.findAll();
  const items = allItems.filter(item => item.orderId == id);
  
  console.log(`[settleOutOrder] 执药单ID: ${id}, 找到明细: ${items.length} 条`);
  
  // 先检查所有药材库存情况
  const insufficientItems = [];
  for (const item of items) {
    const herb = await Herb.findOne({ where: { name: item.herbName } });
    const herbStock = herb ? parseFloat(herb.stock) || 0 : 0;
    
    const inventory = await StockInventory.findOne({ where: { herbName: item.herbName } });
    const inventoryQuantity = inventory ? parseFloat(inventory.quantity) || 0 : 0;
    const needQuantity = parseFloat(item.quantity) || 0;
    
    // 检查库存是否充足
    if (!herb && !inventory) {
      insufficientItems.push({ name: item.herbName, need: needQuantity, have: 0, reason: '药材不存在' });
    } else if (inventory && inventoryQuantity < needQuantity) {
      insufficientItems.push({ name: item.herbName, need: needQuantity, have: inventoryQuantity, reason: '库存统计表不足' });
    } else if (!inventory && herbStock < needQuantity) {
      insufficientItems.push({ name: item.herbName, need: needQuantity, have: herbStock, reason: '药材库存不足' });
    }
  }
  
  // 如果有库存不足的药材，抛出错误
  if (insufficientItems.length > 0) {
    const messages = insufficientItems.map(i => `${i.name}(需${i.need}g, 现${i.have}g, ${i.reason})`);
    throw new Error(`以下药材库存不足：${messages.join('、')}`);
  }
  
  // 库存检查通过，执行扣减
  for (const item of items) {
    const itemQuantity = parseFloat(item.quantity) || 0;
    
    // 更新药材表的库存
    let herb = await Herb.findOne({ where: { name: item.herbName } });
    if (herb) {
      const oldStock = parseFloat(herb.stock) || 0;
      const newStock = Math.max(0, oldStock - itemQuantity);
      await Herb.update({ stock: newStock, updatedAt: getNow() }, { where: { id: herb.id } });
      console.log(`[settleOutOrder] 扣减药材库存: ${item.herbName}, 旧库存: ${oldStock}, 新库存: ${newStock}`);
    }
    
    // 更新库存统计表（如果有记录）
    const inventory = await StockInventory.findOne({ where: { herbName: item.herbName } });
    if (inventory) {
      const oldQuantity = parseFloat(inventory.quantity) || 0;
      const newQuantity = oldQuantity - itemQuantity;
      await StockInventory.update({ 
        quantity: newQuantity, 
        updatedAt: getNow() 
      }, { where: { id: inventory.id } });
      console.log(`[settleOutOrder] 扣减库存统计: ${item.herbName}, 旧数量: ${oldQuantity}, 新数量: ${newQuantity}`);
    }
    
    // 添加日志
    await addStockLog('stock_out', `ZD-${id}`, item.herbName, -itemQuantity, 'admin');
  }
  
  // 更新状态
  await StockOutOrder.update({ status: 'settled', updatedAt: getNow() }, { where: { id } });
  
  // 更新对应处方状态为已结算
  if (order.prescriptionId) {
    try {
      const prescription = await Prescription.findOne({
        where: { prescriptionId: order.prescriptionId, status: '已审核' }
      });
      if (prescription) {
        // 删除旧的已审核记录，创建新的已结算记录
        const oldData = {
          openid: prescription.openid,
          data: prescription.data,
          thumbnail: prescription.thumbnail,
          reviewer: prescription.reviewer,
          reviewDate: prescription.reviewDate,
          prescriptionDate: prescription.prescriptionDate,
          createTime: prescription.createTime
        };
        await prescription.destroy();
        
        await Prescription.create({
          prescriptionId: order.prescriptionId,
          openid: oldData.openid,
          status: '已结算',
          data: oldData.data,
          thumbnail: oldData.thumbnail,
          reviewer: oldData.reviewer,
          reviewDate: oldData.reviewDate,
          modifyDate: new Date(),
          prescriptionDate: oldData.prescriptionDate,
          createTime: oldData.createTime,
          updatedAt: getNow()
        });
        console.log(`[settleOutOrder] 处方状态更新为已结算: ${order.prescriptionId}`);
      }
    } catch (error) {
      console.error('[settleOutOrder] 更新处方状态失败:', error.message);
      // 处方状态更新失败不影响结算结果
    }
  }
  
  const updated = await getOutOrderById(id);
  return {
    code: 0,
    message: '结算成功',
    data: updated
  };
}

// 撤销已结算的执药单
async function revokeSettledOrder(id, operator = 'system') {
  const order = await StockOutOrder.findOne({ where: { id } });
  if (!order) {
    throw new Error('执药单不存在');
  }
  
  if (order.status !== 'settled') {
    throw new Error('只有已结算状态可以撤销');
  }
  
  // 恢复库存
  await revertStockOut(id, operator);
  
  // 更新执药单状态为待执药
  await StockOutOrder.update({ status: 'pending', updatedAt: getNow() }, { where: { id } });
  
  // 更新对应处方状态为已审核
  if (order.prescriptionId) {
    try {
      const prescription = await Prescription.findOne({
        where: { prescriptionId: order.prescriptionId, status: '已结算' }
      });
      if (prescription) {
        const oldData = {
          openid: prescription.openid,
          data: prescription.data,
          thumbnail: prescription.thumbnail,
          reviewer: prescription.reviewer,
          reviewDate: prescription.reviewDate,
          prescriptionDate: prescription.prescriptionDate,
          createTime: prescription.createTime
        };
        await prescription.destroy();
        
        await Prescription.create({
          prescriptionId: order.prescriptionId,
          openid: oldData.openid,
          status: '已审核',
          data: oldData.data,
          thumbnail: oldData.thumbnail,
          reviewer: oldData.reviewer,
          reviewDate: oldData.reviewDate,
          modifyDate: new Date(),
          prescriptionDate: oldData.prescriptionDate,
          createTime: oldData.createTime,
          updatedAt: getNow()
        });
        console.log(`[revokeSettledOrder] 处方状态回退为已审核: ${order.prescriptionId}`);
      }
    } catch (error) {
      console.error('[revokeSettledOrder] 更新处方状态失败:', error.message);
    }
  }
  
  const updated = await getOutOrderById(id);
  return {
    code: 0,
    message: '撤销成功',
    data: updated
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
  revertStockIn,
  
  // 执药管理
  getOutOrders,
  getOutOrderById,
  createOutOrder,
  deleteOutOrder,
  revertOutOrder,
  settleOutOrder,
  revokeSettledOrder,
  executeStockOut,
  revertStockOut,
  
  // 库存统计
  getInventory,
  getInventoryAlert,
  setHerbMinValue,
  getHerbHistory
};
