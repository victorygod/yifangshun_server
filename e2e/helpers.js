/**
 * E2E 测试辅助函数
 */

const BASE_URL = 'http://localhost:80';

/**
 * 登录管理员后台
 */
async function login(page, phone = 'home_super_admin') {
  // 先访问登录页面进行实际的登录操作
  await page.goto('/login.html');
  await page.fill('#phone', phone);
  await page.click('#loginBtn');

  // 等待登录成功（URL 会变化或 localStorage 会被设置）
  await page.waitForFunction(() => {
    return localStorage.getItem('user_openid') !== null;
  }, { timeout: 15000 });

  // 等待一下确保 localStorage 已稳定
  await page.waitForTimeout(500);

  // 导航到管理后台首页
  await page.goto(`/index.html?phone_number=${encodeURIComponent(phone)}`);

  // 等待侧边栏加载
  await page.waitForSelector('.sidebar', { timeout: 15000 });
}

/**
 * 切换到指定模块
 */
async function switchModule(page, moduleName) {
  // 先尝试直接点击菜单项
  const menuItem = page.locator(`.menu-item[data-id="${moduleName}"]`);

  // 如果菜单项不可见，尝试展开父分组
  if (!(await menuItem.isVisible())) {
    // 找到包含该菜单项的分组并展开
    const parentGroup = page.locator('.menu-group').filter({ has: page.locator(`.menu-item[data-id="${moduleName}"]`) });
    if (await parentGroup.count() > 0) {
      const groupHeader = parentGroup.locator('.menu-group-header');
      if (await groupHeader.isVisible()) {
        await groupHeader.click();
        await page.waitForTimeout(300);
      }
    }
  }

  // 点击菜单项
  await menuItem.click();
  await page.waitForSelector('.main .table-container', { timeout: 10000 });
}

/**
 * 等待表格加载完成
 */
async function waitForTable(page) {
  // 等待表格容器出现，如果没有数据则等待空状态提示
  try {
    await page.waitForSelector('.table-container table', { timeout: 5000 });
  } catch {
    // 如果没有表格，可能是空状态
    await page.waitForSelector('.table-container', { timeout: 5000 });
  }
}

/**
 * 获取表格行数
 */
async function getTableRowCount(page) {
  return await page.locator('.table-container table tbody tr').count();
}

/**
 * 搜索表格
 */
async function searchTable(page, keyword) {
  await page.fill('.search-input', keyword);
  await page.click('.search-btn');
  await page.waitForTimeout(500); // 等待搜索结果
}

/**
 * 点击表格操作按钮
 */
async function clickTableAction(page, rowIndex, action) {
  const row = page.locator('.table-container table tbody tr').nth(rowIndex);
  await row.locator(`.action-btn[data-action="${action}"]`).click();
}

/**
 * 确认对话框
 */
async function confirmDialog(page) {
  await page.click('#confirmBtn');
  await page.waitForTimeout(500);
}

/**
 * 关闭对话框
 */
async function closeModal(page) {
  await page.click('.modal-close');
}

/**
 * 检查是否有错误提示
 */
async function hasError(page) {
  const errorEl = await page.$('.error-message.show');
  return errorEl !== null;
}

/**
 * 获取状态栏文本
 */
async function getStatusText(page) {
  return await page.textContent('#statusBar');
}

/**
 * 等待 Toast 消息出现
 */
async function waitForToast(page, timeout = 5000) {
  await page.waitForSelector('.toast.show', { timeout });
}

/**
 * 获取 Toast 消息文本
 */
async function getToastText(page) {
  const toast = await page.$('.toast.show');
  if (toast) {
    return await toast.textContent();
  }
  return null;
}

/**
 * 等待加载完成
 */
async function waitForLoading(page) {
  await page.waitForSelector('.loading', { state: 'hidden', timeout: 10000 });
}

/**
 * 检查是否已登录
 */
async function isLoggedIn(page) {
  const userPhone = await page.evaluate(() => localStorage.getItem('user_phone'));
  return userPhone !== null;
}

/**
 * 登出
 */
async function logout(page) {
  await page.evaluate(() => {
    localStorage.removeItem('user_phone');
    localStorage.removeItem('user_role');
  });
}

/**
 * 获取当前模块名称
 */
async function getCurrentModule(page) {
  const activeItem = await page.$('.sidebar-item.active');
  if (activeItem) {
    return await activeItem.getAttribute('data-module');
  }
  return null;
}

/**
 * 等待 API 响应
 */
async function waitForApiResponse(page, urlPattern, timeout = 10000) {
  return new Promise((resolve) => {
    page.on('response', async (response) => {
      if (response.url().match(urlPattern)) {
        resolve(response);
      }
    });
    setTimeout(() => resolve(null), timeout);
  });
}

/**
 * 模拟文件上传
 */
async function uploadFile(page, selector, filePath) {
  const input = await page.$(selector);
  if (input) {
    await input.setInputFiles(filePath);
  }
}

/**
 * 获取表格单元格文本
 */
async function getTableCellText(page, rowIndex, colIndex) {
  const cell = await page.$(`.table-container table tbody tr:nth-child(${rowIndex + 1}) td:nth-child(${colIndex + 1})`);
  if (cell) {
    return await cell.textContent();
  }
  return null;
}

/**
 * 批量选择行
 */
async function selectRows(page, indices) {
  for (const index of indices) {
    const checkbox = await page.$(`.table-container table tbody tr:nth-child(${index + 1}) .row-checkbox`);
    if (checkbox) {
      await checkbox.check();
    }
  }
}

/**
 * 获取选中的行数
 */
async function getSelectedCount(page) {
  const checked = await page.$$('.table-container table tbody tr .row-checkbox:checked');
  return checked.length;
}

module.exports = {
  BASE_URL,
  login,
  switchModule,
  waitForTable,
  getTableRowCount,
  searchTable,
  clickTableAction,
  confirmDialog,
  closeModal,
  hasError,
  getStatusText,
  waitForToast,
  getToastText,
  waitForLoading,
  isLoggedIn,
  logout,
  getCurrentModule,
  waitForApiResponse,
  uploadFile,
  getTableCellText,
  selectRows,
  getSelectedCount
};