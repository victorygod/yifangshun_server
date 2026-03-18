const https = require('https');

const BASE_URL = 'express-9kv9-232788-7-1410937198.sh.run.tcloudbase.com';

function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: BASE_URL,
      port: 443,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        console.log(`\n${method} ${path}`);
        console.log(`状态码: ${res.statusCode}`);
        console.log(`响应: ${data}`);
        resolve({ statusCode: res.statusCode, data });
      });
    });
    
    req.on('error', (e) => {
      console.error('请求错误:', e.message);
      reject(e);
    });
    
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function test() {
  console.log('===== 云端API测试 =====\n');
  
  // 测试1: 保存处方
  await request('POST', '/api/prescription/save', {
    openid: 'o-eQz3TYzw7PJFltoyjntVijNt88',
    prescriptionId: 'TEST_' + Date.now(),
    name: '测试用户',
    age: '30',
    date: '2026-03-18',
    rp: '当归15g 黄芪20g',
    dosage: '3',
    administrationMethod: '内服',
    medicines: [{ name: '当归', quantity: '15g' }],
    doctor: '测试医师',
    thumbnail: 'test.jpg'
  });
  
  // 测试2: 获取处方列表
  await request('GET', '/api/prescription/list?openid=o-eQz3TYzw7PJFltoyjntVijNt88');
  
  // 测试3: 获取用户历史
  await request('GET', '/api/prescription/user-history?openid=o-eQz3TYzw7PJFltoyjntVijNt88');
}

test();