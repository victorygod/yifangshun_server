// wrappers/local-db.js
// 本地数据库实现 - 使用JSON文件模拟数据库

const fs = require('fs');
const path = require('path');
const config = require('./config');

// 确保数据目录存在
const dataDir = path.join(__dirname, config.database.local.dataDir);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// 生成随机ID
const generateId = () => Math.random().toString(36).substr(2, 9);

// 将时间转换为东八区（CST）时间戳
function toCST(date) {
  if (!date) return date;
  const d = new Date(date);
  // 转换为时间戳，然后加上8小时的偏移量（东八区）
  return new Date(d.getTime() + 8 * 60 * 60 * 1000);
}

// 获取当前东八区时间的ISO字符串
function getNowCST() {
  const now = new Date();
  // 转换为东八区时间
  return new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString();
}

// 读取JSON文件
function readJsonFile(filename) {
  const filePath = path.join(dataDir, filename);
  if (!fs.existsSync(filePath)) {
    return [];
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    console.error(`读取文件失败 ${filename}:`, error);
    return [];
  }
}

// 写入JSON文件
function writeJsonFile(filename, data) {
  const filePath = path.join(dataDir, filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// 通用Model基类
class Model {
  constructor(tableName, primaryKey) {
    this.tableName = tableName;
    this.primaryKey = primaryKey;
  }

  // 查找所有记录
  async findAll(options = {}) {
    let data = readJsonFile(`${this.tableName}.json`);
    
    // 处理where条件
    if (options.where) {
      // 首先处理 Op.or（需要特殊处理，因为它是数组条件）
      const orSymbol = Symbol.for('sequelize:op.or');
      const orConditions = options.where[orSymbol];
      
      if (orConditions && Array.isArray(orConditions)) {
        data = data.filter(item => {
          // Op.or: 满足任意一个条件即可
          return orConditions.some(condition => {
            return Object.keys(condition).every(key => {
              const condValue = condition[key];
              const itemValue = item[key];
              
              // 处理嵌套的操作符
              if (typeof condValue === 'object' && condValue !== null) {
                if (condValue[Symbol.for('sequelize:op.like')] !== undefined) {
                  const pattern = condValue[Symbol.for('sequelize:op.like')].replace(/%/g, '');
                  return itemValue && itemValue.includes(pattern);
                }
                if (condValue[Symbol.for('sequelize:op.ne')] !== undefined) {
                  return itemValue !== condValue[Symbol.for('sequelize:op.ne')];
                }
                if (condValue[Symbol.for('sequelize:op.in')] !== undefined) {
                  const arr = condValue[Symbol.for('sequelize:op.in')];
                  return Array.isArray(arr) && arr.includes(itemValue);
                }
                if (condValue[Symbol.for('sequelize:op.gte')] !== undefined) {
                  return itemValue >= condValue[Symbol.for('sequelize:op.gte')];
                }
                if (condValue[Symbol.for('sequelize:op.gt')] !== undefined) {
                  return itemValue > condValue[Symbol.for('sequelize:op.gt')];
                }
                if (condValue[Symbol.for('sequelize:op.lte')] !== undefined) {
                  return itemValue <= condValue[Symbol.for('sequelize:op.lte')];
                }
                if (condValue[Symbol.for('sequelize:op.lt')] !== undefined) {
                  return itemValue < condValue[Symbol.for('sequelize:op.lt')];
                }
              }
              
              return itemValue == condValue;
            });
          });
        });
      }
      
      // 处理普通where条件
      data = data.filter(item => {
        return Object.keys(options.where).every(key => {
          // 跳过已处理的 Op.or
          if (key === orSymbol) {
            return true;
          }
          
          const whereValue = options.where[key];
          const itemValue = item[key];
          
          // 处理特殊操作符
          if (typeof whereValue === 'object' && whereValue !== null) {
            if (whereValue[Symbol.for('sequelize:op.in')] !== undefined) {
              const arr = whereValue[Symbol.for('sequelize:op.in')];
              return Array.isArray(arr) && arr.includes(itemValue);
            }
            if (whereValue[Symbol.for('sequelize:op.ne')] !== undefined) {
              return itemValue !== whereValue[Symbol.for('sequelize:op.ne')];
            }
            if (whereValue[Symbol.for('sequelize:op.like')] !== undefined) {
              return itemValue && itemValue.includes(whereValue[Symbol.for('sequelize:op.like')].replace(/%/g, ''));
            }
            if (whereValue[Symbol.for('sequelize:op.gte')] !== undefined) {
              // 日期比较：如果是日期字段，转换为 Date 对象比较
              if (key === 'createTime' || key === 'createdAt' || key === 'updatedAt' || key === 'modifyDate' || key === 'reviewDate') {
                return toCST(itemValue) >= toCST(whereValue[Symbol.for('sequelize:op.gte')]);
              }
              return itemValue >= whereValue[Symbol.for('sequelize:op.gte')];
            }
            if (whereValue[Symbol.for('sequelize:op.gt')] !== undefined) {
              // 日期比较：如果是日期字段，转换为 Date 对象比较
              if (key === 'createTime' || key === 'createdAt' || key === 'updatedAt' || key === 'modifyDate' || key === 'reviewDate') {
                return toCST(itemValue) > toCST(whereValue[Symbol.for('sequelize:op.gt')]);
              }
              return itemValue > whereValue[Symbol.for('sequelize:op.gt')];
            }
            if (whereValue[Symbol.for('sequelize:op.lte')] !== undefined) {
              // 日期比较：如果是日期字段，转换为 Date 对象比较
              if (key === 'createTime' || key === 'createdAt' || key === 'updatedAt' || key === 'modifyDate' || key === 'reviewDate') {
                return toCST(itemValue) <= toCST(whereValue[Symbol.for('sequelize:op.lte')]);
              }
              return itemValue <= whereValue[Symbol.for('sequelize:op.lte')];
            }
            if (whereValue[Symbol.for('sequelize:op.lt')] !== undefined) {
              // 日期比较：如果是日期字段，转换为 Date 对象比较
              if (key === 'createTime' || key === 'createdAt' || key === 'updatedAt' || key === 'modifyDate' || key === 'reviewDate') {
                return toCST(itemValue) < toCST(whereValue[Symbol.for('sequelize:op.lt')]);
              }
              return itemValue < whereValue[Symbol.for('sequelize:op.lt')];
            }
          }
          
          return itemValue == whereValue;  // 使用宽松比较，支持字符串和数字类型匹配
        });
      });
    }
    
    // 处理排序
    if (options.order && options.order.length > 0) {
      const [field, direction] = options.order[0];
      data.sort((a, b) => {
        if (direction === 'DESC') {
          return new Date(b[field]) - new Date(a[field]);
        }
        return new Date(a[field]) - new Date(b[field]);
      });
    }
    
    // 处理分页
    if (options.offset !== undefined) {
      data = data.slice(options.offset);
    }
    if (options.limit !== undefined) {
      data = data.slice(0, options.limit);
    }
    
    return data.map(item => {
      const itemWithMethods = { ...item };
      itemWithMethods.update = async (updates) => {
        return await this.update(updates, { where: { [this.primaryKey]: item[this.primaryKey] } });
      };
      itemWithMethods.destroy = async () => {
        return await this.destroy({ where: { [this.primaryKey]: item[this.primaryKey] } });
      };
      return itemWithMethods;
    });
  }

  // 根据主键查找
  async findByPk(id) {
    const data = readJsonFile(`${this.tableName}.json`);
    // 使用宽松比较，支持字符串和数字类型的ID
    const item = data.find(item => item[this.primaryKey] == id);
    
    if (!item) return null;
    
    // 为返回的对象添加update和destroy方法
    const itemWithMethods = { ...item };
    itemWithMethods.update = async (updates) => {
      return await this.update(updates, { where: { [this.primaryKey]: id } });
    };
    itemWithMethods.destroy = async () => {
      return await this.destroy({ where: { [this.primaryKey]: id } });
    };
    
    return itemWithMethods;
  }

  // 根据条件查找一条记录
  async findOne(options = {}) {
    const results = await this.findAll(options);
    return results.length > 0 ? results[0] : null;
  }

  // 创建记录
  async create(data) {
    const list = readJsonFile(`${this.tableName}.json`);
    
    // 生成自增整数 id（与云端保持一致）
    let newId;
    if (data.id !== undefined && data.id !== null) {
      // 如果调用方指定了 id，使用指定的
      newId = data.id;
    } else {
      // 自动生成递增 id
      const maxId = list.reduce((max, item) => {
        const itemId = parseInt(item.id, 10);
        return !isNaN(itemId) && itemId > max ? itemId : max;
      }, 0);
      newId = maxId + 1;
    }
    
    const newRecord = {
      ...data,
      id: newId,
      createdAt: getNowCST(),
      updatedAt: getNowCST()
    };
    
    list.push(newRecord);
    writeJsonFile(`${this.tableName}.json`, list);
    return newRecord;
  }

  // 更新记录
  async update(updates, options = {}) {
    const list = readJsonFile(`${this.tableName}.json`);
    let updatedCount = 0;
    
    const newList = list.map(item => {
      if (options.where) {
        const matches = Object.keys(options.where).every(key => {
          const whereValue = options.where[key];
          const itemValue = item[key];
          
          if (typeof whereValue === 'object') {
            if (whereValue[Symbol.for('sequelize:op.in')] !== undefined) {
              const arr = whereValue[Symbol.for('sequelize:op.in')];
              return Array.isArray(arr) && arr.includes(itemValue);
            }
            if (whereValue[Symbol.for('sequelize:op.ne')] !== undefined) {
              return itemValue !== whereValue[Symbol.for('sequelize:op.ne')];
            }
            if (whereValue[Symbol.for('sequelize:op.gte')] !== undefined) {
              return itemValue >= whereValue[Symbol.for('sequelize:op.gte')];
            }
            if (whereValue[Symbol.for('sequelize:op.gt')] !== undefined) {
              return itemValue > whereValue[Symbol.for('sequelize:op.gt')];
            }
            if (whereValue[Symbol.for('sequelize:op.lte')] !== undefined) {
              return itemValue <= whereValue[Symbol.for('sequelize:op.lte')];
            }
            if (whereValue[Symbol.for('sequelize:op.lt')] !== undefined) {
              return itemValue < whereValue[Symbol.for('sequelize:op.lt')];
            }
          }
          
          // 使用宽松比较，支持字符串和数字类型的ID匹配
          return itemValue == whereValue;
        });
        
        if (matches) {
          updatedCount++;
          return { ...item, ...updates, updatedAt: getNowCST() };
        }
      }
      return item;
    });
    
    writeJsonFile(`${this.tableName}.json`, newList);
    return [updatedCount];
  }

  // 删除记录
  async destroy(options = {}) {
    const list = readJsonFile(`${this.tableName}.json`);
    
    // 如果设置了truncate选项，清空整个表
    if (options.truncate) {
      writeJsonFile(`${this.tableName}.json`, []);
      return list.length;
    }
    
    // 否则根据where条件删除
    const filtered = list.filter(item => {
      if (!options.where) return false;
      
      return !Object.keys(options.where).every(key => {
        const whereValue = options.where[key];
        const itemValue = item[key];
        
        if (typeof whereValue === 'object') {
          if (whereValue[Symbol.for('sequelize:op.in')] !== undefined) {
            const arr = whereValue[Symbol.for('sequelize:op.in')];
            return Array.isArray(arr) && arr.includes(itemValue);
          }
          if (whereValue[Symbol.for('sequelize:op.ne')] !== undefined) {
            return itemValue !== whereValue[Symbol.for('sequelize:op.ne')];
          }
          if (whereValue[Symbol.for('sequelize:op.gte')] !== undefined) {
            return itemValue >= whereValue[Symbol.for('sequelize:op.gte')];
          }
          if (whereValue[Symbol.for('sequelize:op.gt')] !== undefined) {
            return itemValue > whereValue[Symbol.for('sequelize:op.gt')];
          }
          if (whereValue[Symbol.for('sequelize:op.lte')] !== undefined) {
            return itemValue <= whereValue[Symbol.for('sequelize:op.lte')];
          }
          if (whereValue[Symbol.for('sequelize:op.lt')] !== undefined) {
            return itemValue < whereValue[Symbol.for('sequelize:op.lt')];
          }
        }
        
        // 使用宽松比较，支持字符串和数字类型的ID匹配
        return itemValue == whereValue;
      });
    });
    
    const deletedCount = list.length - filtered.length;
    writeJsonFile(`${this.tableName}.json`, filtered);
    return deletedCount;
  }

  // 统计记录数量
  async count(options = {}) {
    const data = await this.findAll(options);
    return data.length;
  }
}

// 定义模型
const User = new Model('users', 'id');
const Booking = new Model('bookings', 'id');
const ChatMessage = new Model('chat_messages', 'id');
const Prescription = new Model('prescriptions', 'id');

// 库存管理相关模型
const Herb = new Model('herbs', 'id');
const StockInOrder = new Model('stock_in_orders', 'id');
const StockInItem = new Model('stock_in_items', 'id');
const StockOutOrder = new Model('stock_out_orders', 'id');
const StockOutItem = new Model('stock_out_items', 'id');
const StockInventory = new Model('stock_inventory', 'id');
const StockLog = new Model('stock_logs', 'id');

// 数据库初始化方法
async function init() {
  // 确保所有表文件存在
  const tables = [
    'users', 'bookings', 'chat_messages', 'prescriptions',
    'herbs', 'stock_in_orders', 'stock_in_items', 
    'stock_out_orders', 'stock_out_items', 
    'stock_inventory', 'stock_logs'
  ];
  tables.forEach(table => {
    const filePath = path.join(dataDir, `${table}.json`);
    if (!fs.existsSync(filePath)) {
      writeJsonFile(`${table}.json`, []);
    }
  });
  
  console.log('本地数据库初始化完成');
}

// Sequelize操作符模拟
const Op = {
  in: Symbol.for('sequelize:op.in'),
  or: Symbol.for('sequelize:op.or'),
  and: Symbol.for('sequelize:op.and'),
  ne: Symbol.for('sequelize:op.ne'),
  like: Symbol.for('sequelize:op.like'),
  lt: Symbol.for('sequelize:op.lt'),
  lte: Symbol.for('sequelize:op.lte'),
  gt: Symbol.for('sequelize:op.gt'),
  gte: Symbol.for('sequelize:op.gte')
};

// 模拟sequelize对象
const sequelize = {
  sync: async () => {
    await init();
  }
};

// 场次配置模型
const ScheduleConfig = new Model('schedule_configs', 'id');

// 导出
module.exports = {
  init,
  User,
  Booking,
  ChatMessage,
  Prescription,
  // 库存管理相关模型
  Herb,
  StockInOrder,
  StockInItem,
  StockOutOrder,
  StockOutItem,
  StockInventory,
  StockLog,
  // 场次配置模型
  ScheduleConfig,
  sequelize,
  Op
};