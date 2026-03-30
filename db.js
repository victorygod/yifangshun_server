const { Sequelize, DataTypes, Op } = require("sequelize");

// ==================== 数据库配置 ====================
// FORCE_SYNC_TABLES: 强制重建表（会丢失数据）
// 设置为 true 后部署时会强制重建所有表
// 用法：部署时如果表结构不匹配，临时改为 true，部署成功后改回 false
const FORCE_SYNC_TABLES = false;

// 从环境变量中读取数据库配置
const { MYSQL_USERNAME, MYSQL_PASSWORD, MYSQL_ADDRESS = "" } = process.env;

const [host, port] = MYSQL_ADDRESS.split(":");

const sequelize = new Sequelize("nodejs_demo", MYSQL_USERNAME, MYSQL_PASSWORD, {
  host,
  port,
  dialect: "mysql" /* one of 'mysql' | 'mariadb' | 'postgres' | 'mssql' */,
  timezone: '+08:00', // 设置时区为东八区
});

// 用户模型
const User = sequelize.define("User", {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  openid: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,  // 唯一约束
  },
  phone: {
    type: DataTypes.STRING(11),
    allowNull: true,  // 【手机号改造】允许为空（登录时可不绑定）
    unique: true,      // 【手机号改造】绑定后唯一
  },
  name: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  isNewUser: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  code: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  role: {
    type: DataTypes.ENUM('user', 'admin', 'super_admin'),
    defaultValue: 'user',
    allowNull: false,
  },
  createdAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
  updatedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
});

// 预约模型 - 支持场次
const Booking = sequelize.define("Booking", {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  // 【手机号改造】只保留 phone，不保留 openid
  phone: {
    type: DataTypes.STRING(11),
    allowNull: false,
    index: true,  // 查询优化
  },
  openid: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  date: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },
  session: {  // 新增：场次
    type: DataTypes.ENUM("morning", "afternoon", "evening"),
    allowNull: true,
  },
  personCount: {  // 新增：预约人数
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 1,
  },
  time: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: "09:30",
  },
  status: {
    type: DataTypes.ENUM("confirmed", "checked_in"),
    defaultValue: "confirmed",
    comment: "confirmed: 待签到, checked_in: 已签到"
  },
  createTime: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
});

// 聊天消息模型
const ChatMessage = sequelize.define("ChatMessage", {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  openid: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  type: {
    type: DataTypes.ENUM("user", "bot"),
    defaultValue: "user",
  },
  createTime: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
});

// 处方记录模型
const Prescription = sequelize.define("Prescription", {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    comment: '自增主键'
  },
  prescriptionId: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: '处方ID（业务标识）'
  },
  status: {
    type: DataTypes.ENUM('待审核', '已审核', '已结算'),
    defaultValue: '待审核',
    allowNull: false,
    comment: '审核状态'
  },
  openid: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: '用户openid（管理员录入可为空）'
  },
  reviewer: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: '审核药师'
  },
  reviewDate: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: '审核日期'
  },
  prescriptionDate: {
    type: DataTypes.DATEONLY,
    allowNull: true,
    comment: '处方日期'
  },
  modifyDate: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: '修改日期'
  },
  data: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: '处方完整数据JSON字符串'
  },
  thumbnail: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: '缩略图URL'
  },
  createTime: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    comment: '创建时间'
  },
  updatedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    comment: '更新时间'
  },
});

// 药材模型
const Herb = sequelize.define("Herb", {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  name: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
  },
  alias: {
    type: DataTypes.STRING(200),
    allowNull: true,
  },
  unit: {
    type: DataTypes.STRING(10),
    defaultValue: '克',
  },
  cabinetNo: {
    type: DataTypes.STRING(20),
    allowNull: true,
  },
  coefficient: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    defaultValue: 1,
  },
  costPrice: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
  },
  salePrice: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
  },
  stock: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0,
  },
  minValue: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0,
  },
  category: {
    type: DataTypes.STRING(50),
    allowNull: true,
  },
  remark: {
    type: DataTypes.STRING(500),
    allowNull: true,
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  createdAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
  updatedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
});

// 入库单模型
const StockInOrder = sequelize.define("StockInOrder", {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  purchaseDate: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },
  orderDate: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },
  orderNo: {
    type: DataTypes.STRING(50),
    allowNull: true,
  },
  supplierName: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  totalPrice: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
  },
  status: {
    type: DataTypes.ENUM('draft', 'confirmed', 'stocked'),
    defaultValue: 'draft',
  },
  remark: {
    type: DataTypes.STRING(500),
    allowNull: true,
  },
  createdAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
  updatedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
});

// 入库明细模型
const StockInItem = sequelize.define("StockInItem", {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  orderId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  herbName: {
    type: DataTypes.STRING(50),
    allowNull: false,
  },
  quality: {
    type: DataTypes.STRING(50),
    allowNull: true,
  },
  origin: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  productionDate: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },
  expiryDate: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },
  quantity: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
  },
  unitPrice: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
  },
  costPrice: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
  },
  totalPrice: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
  },
  remark: {
    type: DataTypes.STRING(500),
    allowNull: true,
  },
  createdAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
  updatedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
});

// 执药单模型
const StockOutOrder = sequelize.define("StockOutOrder", {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  prescriptionId: {
    type: DataTypes.STRING(50),
    allowNull: true,
    unique: true,
  },
  prescriptionTime: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },
  pharmacist: {
    type: DataTypes.STRING(50),
    allowNull: true,
  },
  reviewer: {
    type: DataTypes.STRING(50),
    allowNull: true,
  },
  status: {
    type: DataTypes.ENUM('pending', 'settled', 'cancelled'),
    defaultValue: 'pending',
  },
  totalPrice: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
  },
  remark: {
    type: DataTypes.STRING(500),
    allowNull: true,
  },
  createdAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
  updatedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
});

// 执药明细模型
const StockOutItem = sequelize.define("StockOutItem", {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  orderId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  herbName: {
    type: DataTypes.STRING(50),
    allowNull: false,
  },
  quantity: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
  },
  totalPrice: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
  },
  remark: {
    type: DataTypes.STRING(500),
    allowNull: true,
  },
  createdAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
  updatedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
});

// 库存表模型
const StockInventory = sequelize.define("StockInventory", {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  herbName: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
  },
  herbAlias: {
    type: DataTypes.STRING(200),
    allowNull: true,
  },
  quantity: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0,
  },
  avgPrice: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0,
  },
  minValue: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0,
  },
  updatedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
});

// 场次配置模型（新增）
const ScheduleConfig = sequelize.define("ScheduleConfig", {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  type: {
    type: DataTypes.ENUM('default', 'override'),
    allowNull: false,
    comment: '配置类型：default-默认规则，override-临时调整'
  },
  dayOfWeek: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: '星期几（0-6，仅 default 类型有效）'
  },
  date: {
    type: DataTypes.DATEONLY,
    allowNull: true,
    comment: '具体日期（仅 override 类型有效）'
  },
  session: {
    type: DataTypes.ENUM('morning', 'afternoon', 'evening'),
    allowNull: false,
    comment: '场次'
  },
  isOpen: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    comment: '是否开放预约'
  },
  maxBookings: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: '最大预约人数'
  },
  reason: {
    type: DataTypes.STRING(200),
    allowNull: true,
    comment: '停诊原因（仅 override 类型有效）'
  },
  createdAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
  updatedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
});

// 操作日志模型
const StockLog = sequelize.define("StockLog", {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  type: {
    type: DataTypes.STRING(20),
    allowNull: false,
  },
  herbName: {
    type: DataTypes.STRING(50),
    allowNull: false,
  },
  quantity: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
  },
  beforeStock: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
  },
  afterStock: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
  },
  orderNo: {
    type: DataTypes.STRING(50),
    allowNull: true,
  },
  operator: {
    type: DataTypes.STRING(50),
    allowNull: true,
  },
  remark: {
    type: DataTypes.STRING(500),
    allowNull: true,
  },
  createdAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
});

// 数据库初始化方法
async function init() {
  const syncOption = FORCE_SYNC_TABLES ? { force: true } : { alter: true };
  
  if (FORCE_SYNC_TABLES) {
    console.log('⚠️ FORCE_SYNC_TABLES 已启用，将强制重建所有表（数据将丢失）');
  }
  
  await User.sync(syncOption);
  await Booking.sync(syncOption);
  await ChatMessage.sync(syncOption);
  await Prescription.sync(syncOption);
  await Herb.sync(syncOption);
  await StockInOrder.sync(syncOption);
  await StockInItem.sync(syncOption);
  await StockOutOrder.sync(syncOption);
  await StockOutItem.sync(syncOption);
  await StockInventory.sync(syncOption);
  await StockLog.sync(syncOption);
  await ScheduleConfig.sync(syncOption);  // 新增场次配置表
  
  console.log('数据库表同步完成');
}

// 导出初始化方法和模型
module.exports = {
  init,
  User,
  Booking,
  ChatMessage,
  Prescription,
  Herb,
  StockInOrder,
  StockInItem,
  StockOutOrder,
  StockOutItem,
  StockInventory,
  StockLog,
  ScheduleConfig,  // 新增
  sequelize,
  Op,
};
