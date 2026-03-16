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
      data = data.filter(item => {
        return Object.keys(options.where).every(key => {
          const whereValue = options.where[key];
          const itemValue = item[key];
          
          // 处理特殊操作符
          if (typeof whereValue === 'object') {
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
          
          return itemValue === whereValue;
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
    const item = data.find(item => item[this.primaryKey] === id);
    
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
    const newRecord = {
      ...data,
      id: data.id || generateId(),
      createdAt: getNowCST(),
      updatedAt: getNowCST()
    };
    
    // 为prescriptions表添加复合主键：prescriptionId + status
    if (this.tableName === 'prescriptions') {
      if (newRecord.prescriptionId && newRecord.status) {
        newRecord.id = `${newRecord.prescriptionId}_${newRecord.status}`;
      }
    }
    
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
          
          return itemValue === whereValue;
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
        
        return itemValue === whereValue;
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
const Counter = new Model('counters', 'id');
const User = new Model('users', 'openid');
const Booking = new Model('bookings', 'bookingId');
const ChatMessage = new Model('chat_messages', 'messageId');
const Prescription = new Model('prescriptions', 'id');

// 数据库初始化方法
async function init() {
  // 确保所有表文件存在
  const tables = ['counters', 'users', 'bookings', 'chat_messages', 'prescriptions'];
  tables.forEach(table => {
    const filePath = path.join(dataDir, `${table}.json`);
    if (!fs.existsSync(filePath)) {
      writeJsonFile(`${table}.json`, []);
    }
  });
  
  // 初始化counter表（如果为空）
  const counters = readJsonFile('counters.json');
  if (counters.length === 0) {
    writeJsonFile('counters.json', [{ id: 1, count: 1, createdAt: getNowCST(), updatedAt: getNowCST() }]);
  }
  
  console.log('本地数据库初始化完成');
}

// Sequelize操作符模拟
const Op = {
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

// 导出
module.exports = {
  init,
  Counter,
  User,
  Booking,
  ChatMessage,
  Prescription,
  sequelize,
  Op
};