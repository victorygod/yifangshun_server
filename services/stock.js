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

// 根据药材名或别名查找药材（别名用 | 分隔）
// 返回 { herb, mappedName }，其中 mappedName 是映射后的主药材名
async function findHerbByNameOrAlias(herbName) {
  // 先精确匹配主药材名
  let herb = await Herb.findOne({ where: { name: herbName } });
  if (herb) {
    return { herb, mappedName: herbName };
  }

  // 再匹配别名（alias 字段用 | 分隔）
  const allHerbs = await Herb.findAll({ where: { alias: { [Op.ne]: null, [Op.ne]: '' } } });
  for (const h of allHerbs) {
    const aliases = (h.alias || '').split('|').map(a => a.trim()).filter(a => a);
    if (aliases.includes(herbName)) {
      console.log(`[findHerbByNameOrAlias] 别名映射: "${herbName}" -> "${h.name}"`);
      return { herb: h, mappedName: h.name };
    }
  }

  // 未找到
  return { herb: null, mappedName: herbName };
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
  const { keyword = '', searchFields } = options;
  // 确保分页参数是数字类型
  const page = parseInt(options.page) || 1;
  const pageSize = parseInt(options.pageSize) || 20;
  
  // 获取所有数据（按createdAt降序）
  let allData = await Herb.findAll({
    order: [['createdAt', 'DESC']],
    raw: true
  });
  
  // 多维度搜索
  if (keyword) {
    const keywordLower = keyword.toLowerCase();
    // 如果指定了搜索字段，只在这些字段中搜索
    const fieldsToSearch = searchFields ? searchFields.split(',').map(f => f.trim()) : null;

    allData = allData.filter(row => {
      if (fieldsToSearch) {
        // 只在指定字段中搜索
        for (const key of fieldsToSearch) {
          const value = row[key];
          if (value !== null && value !== undefined) {
            const strValue = String(value).toLowerCase();
            if (strValue.includes(keywordLower)) {
              return true;
            }
          }
        }
      } else {
        // 遍历所有字段进行匹配
        for (const key in row) {
          const value = row[key];
          if (value !== null && value !== undefined) {
            const strValue = String(value).toLowerCase();
            if (strValue.includes(keywordLower)) {
              return true;
            }
          }
        }
      }
      return false;
    });
  }
  
  const totalCount = allData.length;
  const totalPages = Math.ceil(totalCount / pageSize);
  
  // 分页
  const start = (page - 1) * pageSize;
  const rows = allData.slice(start, start + pageSize);
  
  return {
    code: 0,
    data: {
      rows,
      pagination: {
        page,
        pageSize,
        totalCount,
        totalPages
      }
    }
  };
}

// 创建药材
async function createHerb(data) {
  const { name, alias, unit = '克', minValue = 0, category, cabinetNo, coefficient, costPrice, salePrice, remark } = data;

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
    coefficient,
    costPrice,
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
  
  const { name, alias, unit, minValue, category, isActive, cabinetNo, salePrice, costPrice, coefficient, remark } = data;
  
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
  if (costPrice !== undefined) updates.costPrice = costPrice;
  if (coefficient !== undefined) updates.coefficient = coefficient;
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
  const keyword = (options.keyword || '').trim();
  const searchFields = options.searchFields;

  let where = {};
  if (status !== 'all') {
    where.status = status;
  }

  let orders = await StockInOrder.findAll({
    where,
    order: [['createdAt', 'DESC']],
    raw: true
  });

  // 多维度搜索
  if (keyword) {
    const keywordLower = keyword.toLowerCase();
    // 如果指定了搜索字段，只在这些字段中搜索
    const fieldsToSearch = searchFields ? searchFields.split(',').map(f => f.trim()) : null;

    orders = orders.filter(row => {
      if (fieldsToSearch) {
        // 只在指定字段中搜索
        for (const key of fieldsToSearch) {
          const value = row[key];
          if (value !== null && value !== undefined) {
            const strValue = String(value).toLowerCase();
            if (strValue.includes(keywordLower)) {
              return true;
            }
          }
        }
      } else {
        // 遍历所有字段进行匹配
        for (const key in row) {
          const value = row[key];
          if (value !== null && value !== undefined) {
            const strValue = String(value).toLowerCase();
            if (strValue.includes(keywordLower)) {
              return true;
            }
          }
        }
      }
      return false;
    });
  }

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
      ...order,
      items
    };
  }));

  return {
    code: 0,
    data: {
      rows: ordersWithItems,
      pagination: {
        page,
        pageSize,
        totalCount,
        totalPages
      }
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
  const { purchaseDate, orderDate, supplierName, remark, items = [] } = data;
  
  if (!supplierName) {
    throw new Error('供应商名称不能为空');
  }
  
  const orderNo = generateOrderNo('RK');
  
  // 计算总金额（单价为公斤价，数量为克数，需除以1000）
  let totalPrice = 0;
  items.forEach(item => {
    totalPrice += (item.quantity || 0) * (item.unitPrice || 0) / 1000;
  });

  const order = await StockInOrder.create({
    orderNo,
    purchaseDate,
    orderDate,
    supplierName,
    status: 'draft',
    remark,
    totalPrice,
    createdAt: getNow(),
    updatedAt: getNow()
  });
  
  // 创建明细（单价为公斤价，数量为克数，总价需除以1000）
  for (const item of items) {
    const costPrice = item.costPrice !== undefined ? item.costPrice : item.unitPrice;
    await StockInItem.create({
      orderId: order.id,
      herbName: item.herbName,
      quality: item.quality,
      origin: item.origin,
      productionDate: item.productionDate,
      expiryDate: item.expiryDate,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      costPrice: costPrice,
      totalPrice: (item.quantity || 0) * (item.unitPrice || 0) / 1000,
      remark: item.remark
    });
    // 草稿状态下不更新药材信息，只在确认入库时更新
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
  
  const { purchaseDate, orderDate, supplierName, remark, items } = data;
  
  const updates = {};
  if (purchaseDate !== undefined) updates.purchaseDate = purchaseDate;
  if (orderDate !== undefined) updates.orderDate = orderDate;
  if (supplierName !== undefined) updates.supplierName = supplierName;
  if (remark !== undefined) updates.remark = remark;
  updates.updatedAt = getNow();
  
  // 如果有明细更新（单价为公斤价，数量为克数，总价需除以1000）
  if (items !== undefined) {
    let totalPrice = 0;
    items.forEach(item => {
      totalPrice += (item.quantity || 0) * (item.unitPrice || 0) / 1000;
    });
    updates.totalPrice = totalPrice;
  }

  await StockInOrder.update(updates, { where: { id } });

  // 更新明细
  if (items !== undefined) {
    // 删除旧明细
    await StockInItem.destroy({ where: { orderId: id } });

    // 创建新明细
    for (const item of items) {
      const costPrice = item.costPrice !== undefined ? item.costPrice : item.unitPrice;
      await StockInItem.create({
        orderId: id,
        herbName: item.herbName,
        quality: item.quality,
        origin: item.origin,
        productionDate: item.productionDate,
        expiryDate: item.expiryDate,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        costPrice: costPrice,
        totalPrice: (item.quantity || 0) * (item.unitPrice || 0) / 1000,
        remark: item.remark
      });
      // 草稿状态下不更新药材信息，只在确认入库时更新
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
  
  // 更新药材表的成本价和售价（只在确认入库时更新）
  for (const item of items) {
    const herb = await Herb.findOne({ where: { name: item.herbName } });
    if (herb && item.costPrice !== undefined && item.costPrice !== null) {
      const coefficient = parseFloat(herb.coefficient) || 1;
      const newSalePrice = coefficient * parseFloat(item.costPrice);
      await Herb.update(
        { costPrice: item.costPrice, salePrice: newSalePrice, updatedAt: getNow() },
        { where: { name: item.herbName } }
      );
      console.log(`[executeStockIn] 更新药材信息: ${item.herbName}, 成本价: ${item.costPrice}, 售价: ${newSalePrice}`);
    }
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

// 更新执药单
async function updateOutOrder(id, data) {
  const order = await StockOutOrder.findOne({ where: { id } });
  if (!order) {
    throw new Error('执药单不存在');
  }

  if (order.status !== 'pending') {
    throw new Error('只有待执药状态的执药单可以修改');
  }

  const { prescriptionId, prescriptionTime, pharmacist, remark, items } = data;

  const updates = {};
  if (prescriptionId !== undefined) updates.prescriptionId = prescriptionId || null;
  if (prescriptionTime !== undefined) updates.prescriptionTime = prescriptionTime;
  if (pharmacist !== undefined) updates.pharmacist = pharmacist;
  if (remark !== undefined) updates.remark = remark;
  updates.updatedAt = getNow();
  
  // 如果有明细更新（单价为公斤价，数量为克数，总价需除以1000）
  if (items !== undefined) {
    let totalPrice = 0;
    items.forEach(item => {
      totalPrice += (item.quantity || 0) * (item.unitPrice || 0) / 1000;
    });
    updates.totalPrice = totalPrice;
  }

  await StockOutOrder.update(updates, { where: { id } });

  // 更新明细
  if (items !== undefined) {
    // 删除旧明细
    await StockOutItem.destroy({ where: { orderId: id } });

    // 创建新明细（支持别名映射）
    for (const item of items) {
      const { herb, mappedName } = await findHerbByNameOrAlias(item.herbName);
      const unitPrice = herb ? (herb.salePrice || 0) : 0;

      await StockOutItem.create({
        orderId: id,
        herbName: mappedName,  // 使用映射后的主药材名
        cabinetNo: item.cabinetNo,
        quantity: item.quantity,
        unitPrice: unitPrice,
        totalPrice: (item.quantity || 0) * unitPrice / 1000,
        createdAt: getNow(),
        updatedAt: getNow()
      });
    }
  }
  
  const updated = await getOutOrderById(id);
  return {
    code: 0,
    message: '更新成功',
    data: updated.data
  };
}

// 获取执药单列表
async function getOutOrders(options = {}) {
  // 确保参数为数字类型
  const page = parseInt(options.page) || 1;
  const pageSize = parseInt(options.pageSize) || 20;
  const status = options.status || 'all';
  const keyword = (options.keyword || '').trim();
  const searchFields = options.searchFields;

  let where = {};
  if (status !== 'all') {
    where.status = status;
  }

  let orders = await StockOutOrder.findAll({
    where,
    order: [['prescriptionTime', 'DESC'], ['createdAt', 'DESC']],
    raw: true
  });

  // 多维度搜索
  if (keyword) {
    const keywordLower = keyword.toLowerCase();
    // 如果指定了搜索字段，只在这些字段中搜索
    const fieldsToSearch = searchFields ? searchFields.split(',').map(f => f.trim()) : null;

    orders = orders.filter(row => {
      if (fieldsToSearch) {
        // 只在指定字段中搜索
        for (const key of fieldsToSearch) {
          const value = row[key];
          if (value !== null && value !== undefined) {
            const strValue = String(value).toLowerCase();
            if (strValue.includes(keywordLower)) {
              return true;
            }
          }
        }
      } else {
        // 遍历所有字段进行匹配
        for (const key in row) {
          const value = row[key];
          if (value !== null && value !== undefined) {
            const strValue = String(value).toLowerCase();
            if (strValue.includes(keywordLower)) {
              return true;
            }
          }
        }
      }
      return false;
    });
  }

  // 分页
  const totalCount = orders.length;
  const totalPages = Math.ceil(totalCount / pageSize);
  const start = (page - 1) * pageSize;
  const pagedOrders = orders.slice(start, start + pageSize);

  // 获取每个订单的明细（使用宽松比较匹配orderId）
  const allItems = await StockOutItem.findAll();
  const ordersWithItems = await Promise.all(pagedOrders.map(async (order) => {
    let items = allItems.filter(item => item.orderId == order.id);

    // 为每个明细查询药材柜号（支持别名映射）
    const itemsWithCabinetNo = await Promise.all(items.map(async (item) => {
      const { herb } = await findHerbByNameOrAlias(item.herbName);
      return {
        ...toPlainObject(item),
        cabinetNo: herb ? herb.cabinetNo || '' : ''
      };
    }));

    // 待执药状态：自动同步药材单价（单价为公斤价，数量为克数，总价需除以1000）
    if (order.status === 'pending' && itemsWithCabinetNo.length > 0) {
      let needUpdateTotal = false;
      for (const item of itemsWithCabinetNo) {
        const { herb } = await findHerbByNameOrAlias(item.herbName);
        if (herb && herb.salePrice != null && parseFloat(herb.salePrice) !== parseFloat(item.unitPrice)) {
          const newUnitPrice = parseFloat(herb.salePrice);
          const newTotalPrice = parseFloat(item.quantity) * newUnitPrice / 1000;
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
      ...order,
      items: itemsWithCabinetNo
    };
  }));

  return {
    code: 0,
    data: {
      rows: ordersWithItems,
      pagination: {
        page,
        pageSize,
        totalCount,
        totalPages
      }
    }
  };
}

// 创建执药单（从处方导入或手动创建）
async function createOutOrder(data, operator = 'system', dosage = 1) {
  const { prescriptionId, prescriptionTime, pharmacist, reviewer, remark, items = [] } = data;

  // 如果有处方ID，检查是否已创建执药单
  if (prescriptionId) {
    const existing = await StockOutOrder.findOne({ where: { prescriptionId } });
    if (existing) {
      throw new Error('该处方已创建执药单');
    }
  }
  
  // 计算总金额（单价为公斤价，数量为克数，需除以1000）
  let totalPrice = 0;
  for (const item of items) {
    // 获取药材售价（支持别名映射）
    const { herb } = await findHerbByNameOrAlias(item.herbName);
    const unitPrice = herb ? parseFloat(herb.salePrice) || 0 : 0;
    // 实际克数 = 单剂克数 × 剂数
    const actualQuantity = parseFloat(item.quantity || 0) * dosage;
    totalPrice += actualQuantity * unitPrice / 1000;
  }

  // 生成执药单编号（手动创建时使用）
  const orderNo = prescriptionId ? `ZD-${prescriptionId}` : `ZD-MANUAL-${Date.now()}`;

  const order = await StockOutOrder.create({
    prescriptionId: prescriptionId || null,
    prescriptionTime: prescriptionTime || getNow(),
    pharmacist,
    reviewer,
    status: 'pending',
    remark,
    totalPrice,
    createdAt: getNow(),
    updatedAt: getNow()
  });

  // 创建明细（单价为公斤价，数量为克数，总价需除以1000）
  for (const item of items) {
    // 支持别名映射：将别名映射到主药材名
    const { herb, mappedName } = await findHerbByNameOrAlias(item.herbName);
    const unitPrice = herb ? parseFloat(herb.salePrice) || 0 : 0;
    const singleQuantity = parseFloat(item.quantity || 0);
    const actualQuantity = singleQuantity * dosage;  // 实际克数 = 单剂克数 × 剂数

    await StockOutItem.create({
      orderId: order.id,
      herbName: mappedName,  // 使用映射后的主药材名
      quantity: actualQuantity,
      unitPrice,
      totalPrice: actualQuantity * unitPrice / 1000,
      createdAt: getNow()
    });

    // 添加日志
    await addStockLog('stock_out', orderNo, mappedName, actualQuantity, operator);
  }
  
  const created = await getOutOrderById(order.id);
  return {
    code: 0,
    message: '创建成功',
    data: created.data
  };
}

// 获取出库单详情
async function getOutOrderById(id) {
  const order = await StockOutOrder.findOne({ where: { id } });
  if (!order) {
    throw new Error('出库单不存在');
  }
  
  const items = await StockOutItem.findAll({ where: { orderId: id } });
  
  // 为每个明细查询药材柜号（支持别名映射）
  const itemsWithCabinetNo = await Promise.all(items.map(async (item) => {
    const { herb } = await findHerbByNameOrAlias(item.herbName);
    return {
      ...toPlainObject(item),
      cabinetNo: herb ? herb.cabinetNo || '' : ''
    };
  }));

  // 待执药状态：自动同步药材单价（单价为公斤价，数量为克数，总价需除以1000）
  if (order.status === 'pending' && itemsWithCabinetNo.length > 0) {
    let needUpdateTotal = false;
    for (const item of itemsWithCabinetNo) {
      const { herb } = await findHerbByNameOrAlias(item.herbName);
      if (herb && herb.salePrice != null && parseFloat(herb.salePrice) !== parseFloat(item.unitPrice)) {
        const newUnitPrice = parseFloat(herb.salePrice);
        const newTotalPrice = parseFloat(item.quantity) * newUnitPrice / 1000;
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

  // 始终根据明细重新计算总价（确保返回正确的总价）
  const calculatedTotal = itemsWithCabinetNo.reduce((sum, item) => {
    return sum + (parseFloat(item.totalPrice) || 0);
  }, 0);
  
  // 如果计算的总价与数据库中的不一致，更新数据库
  if (calculatedTotal !== parseFloat(order.totalPrice)) {
    console.log(`[getOutOrderById] 总价不一致，更新: ${order.totalPrice} -> ${calculatedTotal}`);
    await StockOutOrder.update({ totalPrice: calculatedTotal }, { where: { id } });
    order.totalPrice = calculatedTotal;
  }

  return {
    code: 0,
    data: {
      ...toPlainObject(order),
      items: itemsWithCabinetNo
    }
  };
}

// 删除出库单
async function deleteOutOrder(id) {
  const order = await StockOutOrder.findOne({ where: { id } });
  if (!order) {
    throw new Error('执药单不存在');
  }

  // 已结算状态不能删除
  if (order.status === 'settled') {
    throw new Error('已结算执药单不可删除');
  }

  // 删除明细
  await StockOutItem.destroy({ where: { orderId: id } });

  // 删除执药单主记录
  await StockOutOrder.destroy({ where: { id } });

  // 将对应处方状态回退为待审核
  try {
    console.log('[deleteOutOrder] 准备回退处方状态');
    console.log('  执药单处方ID:', order.prescriptionId);
    
    const prescription = await Prescription.findOne({
      where: { prescriptionId: order.prescriptionId, status: '已审核' }
    });
    
    console.log('  查询结果:', prescription ? '找到已审核处方' : '未找到已审核处方');

    if (prescription) {
      // 删除已审核记录，创建待审核记录
      await Prescription.create({
        prescriptionId: order.prescriptionId,
        openid: prescription.openid,
        phone: prescription.phone,
        status: '待审核',
        data: prescription.data,
        thumbnail: prescription.thumbnail,
        prescriptionDate: prescription.prescriptionDate,
        createdAt: prescription.createTime || getNow(),
        updatedAt: getNow()
      });

      // 删除已审核记录
      await prescription.destroy();
      console.log(`[deleteOutOrder] 处方状态回退为待审核: ${order.prescriptionId}`);
    }
  } catch (error) {
    console.error('[deleteOutOrder] 处方状态回退失败:', error.message);
    // 处方状态回退失败不影响执药单删除结果
  }

  return {
    code: 0,
    message: '删除成功'
  };
}

// 结算执药单
async function settleOutOrder(id, operator = 'admin') {
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
  
  // 先检查所有药材库存情况（支持别名映射）
  const insufficientItems = [];
  for (const item of items) {
    const { herb } = await findHerbByNameOrAlias(item.herbName);
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

    // 更新药材表的库存（支持别名映射）
    const { herb } = await findHerbByNameOrAlias(item.herbName);
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
  await StockOutOrder.update({ 
    status: 'settled', 
    pharmacist: operator,
    updatedAt: getNow() 
  }, { where: { id } });
  
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
  executeStockIn,
  revertStockIn,
  
  // 执药管理
  getOutOrders,
  getOutOrderById,
  createOutOrder,
  updateOutOrder,
  deleteOutOrder,
  settleOutOrder,
  revokeSettledOrder,
  executeStockOut,
  revertStockOut
};
