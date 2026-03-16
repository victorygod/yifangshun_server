const { Sequelize, DataTypes, Op } = require("sequelize");

// 从环境变量中读取数据库配置
const { MYSQL_USERNAME, MYSQL_PASSWORD, MYSQL_ADDRESS = "" } = process.env;

const [host, port] = MYSQL_ADDRESS.split(":");

const sequelize = new Sequelize("nodejs_demo", MYSQL_USERNAME, MYSQL_PASSWORD, {
  host,
  port,
  dialect: "mysql" /* one of 'mysql' | 'mariadb' | 'postgres' | 'mssql' */,
  timezone: '+08:00', // 设置时区为东八区
});

// 定义数据模型
const Counter = sequelize.define("Counter", {
  count: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
  },
});

// 用户模型
const User = sequelize.define("User", {
  openid: {
    type: DataTypes.STRING,
    primaryKey: true,
  },
  phone: {
    type: DataTypes.STRING(11),
    allowNull: true,
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

// 预约模型
const Booking = sequelize.define("Booking", {
  bookingId: {
    type: DataTypes.STRING,
    primaryKey: true,
  },
  openid: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  date: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },
  time: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: "09:30",
  },
  status: {
    type: DataTypes.ENUM("confirmed", "cancelled"),
    defaultValue: "confirmed",
  },
  createTime: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
});

// 聊天消息模型
const ChatMessage = sequelize.define("ChatMessage", {
  messageId: {
    type: DataTypes.STRING,
    primaryKey: true,
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
    comment: '内部主键'
  },
  prescriptionId: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: '处方ID（业务标识）'
  },
  status: {
    type: DataTypes.ENUM('待审核', '已审核'),
    defaultValue: '待审核',
    allowNull: false,
    comment: '审核状态'
  },
  openid: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: '用户openid'
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

// 数据库初始化方法
async function init() {
  await Counter.sync({ alter: true });
  await User.sync({ alter: true });
  await Booking.sync({ alter: true });
  await ChatMessage.sync({ alter: true });
  await Prescription.sync({ alter: true });
}

// 导出初始化方法和模型
module.exports = {
  init,
  Counter,
  User,
  Booking,
  ChatMessage,
  Prescription,
  sequelize,
  Op,
};
