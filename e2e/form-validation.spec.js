/**
 * 表单验证测试
 */

const { test, expect } = require('@playwright/test');
const { login, switchModule, waitForTable } = require('./helpers');

test.describe('登录表单验证', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login.html');
  });

  test('空手机号提交应显示验证错误', async ({ page }) => {
    // 清空输入框并直接点击登录
    await page.fill('#phone', '');
    await page.click('#loginBtn');

    // 由于输入框有 required 属性，浏览器会显示验证提��
    const isInvalid = await page.$eval('#phone', el => !el.validity.valid);
    expect(isInvalid).toBe(true);
  });

  test('无效手机号格式应显示错误', async ({ page }) => {
    await page.fill('#phone', 'invalid');
    await page.click('#loginBtn');
    await expect(page.locator('.error-message.show')).toBeVisible();
  });

  test('未注册手机号应显示错误', async ({ page }) => {
    await page.fill('#phone', '99999999999');
    await page.click('#loginBtn');
    await page.waitForTimeout(1000);
    await expect(page.locator('.error-message.show')).toBeVisible();
  });

  test('登录按钮点击后应禁用', async ({ page }) => {
    await page.fill('#phone', 'home_super_admin');
    const btn = page.locator('#loginBtn');
    await btn.click();
    await expect(btn).toBeDisabled();
  });
});

test.describe('表格编辑功能', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    // 展开库存管理分组
    const stockGroup = page.locator('.menu-group[data-group="stock"]');
    if (await stockGroup.isVisible()) {
      await stockGroup.locator('.menu-group-header').click();
      await page.waitForTimeout(300);
    }
    await switchModule(page, 'herbs');
  });

  test('点击单元格进入编辑模式', async ({ page }) => {
    // 等待表格加载
    await page.waitForSelector('.table-container', { timeout: 10000 });

    const editableCell = page.locator('.cell-clickable').first();
    if (await editableCell.isVisible()) {
      await editableCell.click();
      await page.waitForTimeout(300);
      await expect(page.locator('.cell-input')).toBeVisible();
    }
  });
});