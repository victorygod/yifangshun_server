const { Sequelize, DataTypes } = require("sequelize");

// 从环境变量中读取数据库配置
const { MYSQL_USERNAME, MYSQL_PASSWORD, MYSQL_ADDRESS = "" } = process.env;

const [host, port] = MYSQL_ADDRESS.split(":");

const sequelize = new Sequelize("nodejs_demo", MYSQL_USERNAME, MYSQL_PASSWORD, {
  host,
  port,
  dialect: "mysql" /* one of 'mysql' | 'mariadb' | 'postgres' | 'mssql' */,
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
  sessionKey: {
    type: DataTypes.STRING,
    allowNull: true,
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
  prescriptionId: {
    type: DataTypes.STRING,
    primaryKey: true,
  },
  openid: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  image: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  text: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  createTime: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
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
};
