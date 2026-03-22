/**
 * API测试管理脚本
 * 
 * 用途：
 * 1. 自动化测试流程：清理端口、启动服务器、运行测试、清理进程
 * 2. 提供测试命令快捷方式
 * 
 * 使用方法：
 * node test/run_test.js [命令]
 * 
 * 命令：
 * - run: 运行完整测试
 * - clean: 清理端口占用
 * - start: 启动服务器
 * - stop: 停止服务器
 * - status: 查看服务器状态
 */

const { exec, spawn } = require('child_process');
const path = require('path');
const BASE_URL = 'http://localhost:80';

// 命令行参数
const command = process.argv[2] || 'run';

/**
 * 执行命令（增加缓冲区大小）
 */
function execCommand(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, { 
      cwd: path.join(__dirname, '..'), 
      maxBuffer: 1024 * 1024 * 10 // 10MB 缓冲区
    }, (error, stdout, stderr) => {
      if (error) {
        reject(error);
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}

/**
 * 查找占用80端口的进程
 */
async function findPortProcess() {
  try {
    const { stdout } = await execCommand('netstat -ano | findstr ":80" | findstr "LISTENING"');
    const lines = stdout.trim().split('\n');
    
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 5) {
        const pid = parts[parts.length - 1];
        return pid;
      }
    }
    return null;
  } catch (error) {
    return null;
  }
}

/**
 * 杀掉占用80端口的进程
 */
async function cleanPort() {
  console.log('🔍 检查80端口占用情况...');
  
  const pid = await findPortProcess();
  
  if (pid) {
    console.log(`🔧 发现进程占用80端口 (PID: ${pid})，正在清理...`);
    
    try {
      await execCommand(`taskkill /F /PID ${pid}`);
      console.log('✅ 端口清理完成');
      
      // 等待一下确保端口完全释放
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.log('❌ 端口清理失败:', error.message);
      throw error;
    }
  } else {
    console.log('✅ 80端口未被占用');
  }
}

/**
 * 启动服务器
 */
async function startServer() {
  console.log('🚀 启动服务器...');
  
  try {
    const process = exec('npm start', { cwd: path.join(__dirname, '..') });
    
    process.stdout.on('data', (data) => {
      const output = data.toString();
      if (output.includes('服务器已启动') || output.includes('易方顺诊所助手服务器')) {
        console.log('✅ 服务器启动成功');
      }
    });
    
    process.stderr.on('data', (data) => {
      console.error('服务器错误:', data.toString());
    });
    
    process.on('error', (error) => {
      console.error('服务器启动失败:', error.message);
      throw error;
    });
    
    // 保存进程引用，用于后续停止
    global.serverProcess = process;
    
    // 等待服务器启动（增加到 5 秒）
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    console.log('✅ 服务器运行在', BASE_URL);
    
  } catch (error) {
    console.error('❌ 服务器启动失败:', error.message);
    throw error;
  }
}

/**
 * 停止服务器
 */
async function stopServer() {
  console.log('🛑 停止服务器...');
  
  // 先清理端口占用
  await cleanPort();
  
  console.log('✅ 服务器已停止');
}

/**
 * 运行完整测试
 */
async function runTest() {
  console.log('========================================');
  console.log('易方顺诊所助手 - API测试');
  console.log('========================================\n');
  
  try {
    // 1. 清理端口
    await cleanPort();
    
    // 2. 启动服务器
    await startServer();
    
    // 3. 运行测试
    console.log('\n🧪 开始运行测试...');
    const { stdout, stderr } = await execCommand('node test/comprehensive_api_test.js');
    
    console.log(stdout);
    if (stderr) {
      console.error('测试错误:', stderr);
    }
    
    // 4. 停止服务器
    await stopServer();
    
    console.log('\n========================================');
    console.log('✅ 测试流程完成');
    console.log('========================================');
    
  } catch (error) {
    console.error('\n❌ 测试流程失败:', error.message);
    
    // 尝试清理
    try {
      await stopServer();
    } catch (e) {
      console.error('清理失败:', e.message);
    }
    
    process.exit(1);
  }
}

/**
 * 查看服务器状态
 */
async function checkStatus() {
  console.log('========================================');
  console.log('服务器状态检查');
  console.log('========================================\n');
  
  const pid = await findPortProcess();
  
  if (pid) {
    console.log(`✅ 服务器正在运行`);
    console.log(`   进程ID: ${pid}`);
    console.log(`   地址: ${BASE_URL}`);
  } else {
    console.log(`❌ 服务器未运行`);
    console.log(`   地址: ${BASE_URL}`);
  }
  
  console.log('\n========================================');
}

/**
 * 主函数
 */
async function main() {
  try {
    switch (command) {
      case 'run':
        await runTest();
        break;
      case 'clean':
        await cleanPort();
        break;
      case 'start':
        await cleanPort();
        await startServer();
        console.log('\n💡 提示：使用 Ctrl+C 停止服务器，或运行 node test/run_test.js stop');
        break;
      case 'stop':
        await stopServer();
        break;
      case 'status':
        await checkStatus();
        break;
      default:
        console.log('========================================');
        console.log('易方顺诊所助手 - API测试管理');
        console.log('========================================\n');
        console.log('用法: node test/run_test.js [命令]\n');
        console.log('可用命令:');
        console.log('  run    - 运行完整测试（清理→启动→测试→停止）');
        console.log('  clean  - 清理80端口占用');
        console.log('  start  - 启动服务器');
        console.log('  stop   - 停止服务器');
        console.log('  status - 查看服务器状态');
        console.log('\n示例:');
        console.log('  node test/run_test.js run');
        console.log('  node test/run_test.js clean');
        console.log('  node test/run_test.js start');
        console.log('  node test/run_test.js stop');
        console.log('  node test/run_test.js status');
        console.log('========================================');
        break;
    }
  } catch (error) {
    console.error('❌ 执行失败:', error.message);
    process.exit(1);
  }
}

// 运行主函数
main();