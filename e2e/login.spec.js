/**
 * 登录页面测试
 */

const { test, expect } = require('@playwright/test');

test.describe('登录页面', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login.html');
  });

  test('页面正常加载', async ({ page }) => {
    await expect(page).toHaveTitle(/易方顺诊所/);
    await expect(page.locator('h1')).toContainText('易方顺诊所');
    await expect(page.locator('#phone')).toBeVisible();
    await expect(page.locator('#loginBtn')).toBeVisible();
  });

  test('空手机号登录应提示错误', async ({ page }) => {
    // 清空输入框（如果有默认值）并直接点击登录
    await page.fill('#phone', '');
    await page.click('#loginBtn');

    // 由于输入框有 required 属性，浏览器会显示验证提示
    // 我们检查输入框是否处于 invalid 状态
    const isInvalid = await page.$eval('#phone', el => !el.validity.valid);
    expect(isInvalid).toBe(true);
  });

  test('无效手机号登录应提示错误', async ({ page }) => {
    await page.fill('#phone', 'invalid_phone');
    await page.click('#loginBtn');

    // 等待错误提示
    await page.waitForSelector('.error-message.show', { timeout: 5000 });
    await expect(page.locator('.error-message')).toContainText('未注册');
  });

  test('默认超级管理员登录成功', async ({ page }) => {
    await page.fill('#phone', 'home_super_admin');
    await page.click('#loginBtn');

    // 等待 URL 变化（包含 phone_number 参数）
    await page.waitForURL(/phone_number/, { timeout: 10000 });

    // 验证 localStorage 已保存
    const userPhone = await page.evaluate(() => localStorage.getItem('user_phone'));
    expect(userPhone).toBe('home_super_admin');
  });

  test('登录按钮状态变化', async ({ page }) => {
    await page.fill('#phone', 'home_super_admin');

    const btn = page.locator('#loginBtn');
    await expect(btn).toBeEnabled();
    expect((await btn.textContent()).trim()).toBe('登录');

    // 点击后应该禁用
    await btn.click();
    await expect(btn).toBeDisabled();
    expect((await btn.textContent()).trim()).toBe('登录中...');
  });
});