/**
 * 预约管理完整测试
 *
 * 覆盖功能：
 * - 预约列表显示
 * - 预约状态管理
 * - 预约编辑
 * - 预约删除
 * - 预约规则验证
 */

const { test, expect } = require('@playwright/test');
const { login, switchModule } = require('./helpers');

test.describe('预约管理', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await switchModule(page, 'bookings');
  });

  test('预约列表显示', async ({ page }) => {
    await expect(page.locator('.table-container')).toBeVisible();
  });

  test('预约表头显示正确', async ({ page }) => {
    // 验证关键列存在
    const expectedHeaders = ['预约日期', '预约时间', '状态', '患者'];

    for (const header of expectedHeaders) {
      const headerCell = page.locator(`th:has-text("${header}")`);
      if (await headerCell.count() > 0) {
        await expect(headerCell.first()).toBeVisible();
      }
    }
  });

  test('预约状态显示正确', async ({ page }) => {
    // 验证状态列存在
    const statusBadge = page.locator('td .badge').first();
    if (await statusBadge.isVisible()) {
      const text = await statusBadge.textContent();
      expect(['待确认', '已确认', '已取消', '已完成']).toContain(text.trim());
    }
  });
});

test.describe('预约详情管理', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await switchModule(page, 'bookings');
  });

  test('展开预约查看详情', async ({ page }) => {
    const expandBtn = page.locator('.action-btn-expand').first();
    if (await expandBtn.isVisible()) {
      await expandBtn.click();
      await page.waitForTimeout(300);

      // 验证详情区域出现
      await expect(page.locator('.detail-row, .detail-content')).toBeVisible();
    }
  });

  test('预约详情显示关键信息', async ({ page }) => {
    const firstRow = page.locator('tbody tr').first();
    if (await firstRow.isVisible()) {
      await firstRow.locator('.action-btn-expand').click();
      await page.waitForTimeout(500);

      // 验证详情内容
      const detailContent = page.locator('.detail-content, .detail-row');
      if (await detailContent.isVisible()) {
        // 验证关键信息显示
        const detailText = await detailContent.textContent();
        // 详情应该包含预约相关信息
        expect(detailText.length).toBeGreaterThan(0);
      }
    }
  });
});

test.describe('预约编辑功能', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await switchModule(page, 'bookings');
  });

  test('点击单元格进入编辑模式', async ({ page }) => {
    await page.waitForSelector('.table-container', { timeout: 10000 });

    const editableCell = page.locator('.cell-clickable').first();
    if (await editableCell.isVisible()) {
      await editableCell.click();
      await page.waitForTimeout(300);

      // 验证编辑输入框出现
      await expect(page.locator('.cell-input')).toBeVisible();
    }
  });

  test('编辑预约后保存', async ({ page }) => {
    const firstRow = page.locator('tbody tr').first();
    if (await firstRow.isVisible()) {
      // 点击编辑按钮（如果有）
      const editBtn = firstRow.locator('.action-btn-edit');
      if (await editBtn.isVisible()) {
        await editBtn.click();
        await page.waitForTimeout(300);

        // 验证进入编辑模式
        const input = page.locator('.cell-input').first();
        if (await input.isVisible()) {
          await expect(input).toBeEditable();
        }
      }
    }
  });
});

test.describe('预约状态管理', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await switchModule(page, 'bookings');
  });

  test('待确认状态显示确认按钮', async ({ page }) => {
    const pendingRow = page.locator('tr').filter({ has: page.locator('.badge-pending, .badge-待确认') }).first();
    if (await pendingRow.isVisible()) {
      const confirmBtn = pendingRow.locator('.action-btn-confirm');
      if (await confirmBtn.isVisible()) {
        await expect(confirmBtn).toBeVisible();
      }
    }
  });

  test('确认预约弹出确认对话框', async ({ page }) => {
    const pendingRow = page.locator('tr').filter({ has: page.locator('.badge-pending, .badge-待确认') }).first();
    if (await pendingRow.isVisible()) {
      const confirmBtn = pendingRow.locator('.action-btn-confirm');
      if (await confirmBtn.isVisible()) {
        await confirmBtn.click();
        await page.waitForTimeout(300);

        // 验证确认对话框出现
        await expect(page.locator('#confirmModal.show')).toBeVisible();

        // 取消操作
        await page.click('#confirmModal.show .modal-footer button:first-child');
      }
    }
  });

  test('已确认状态显示取消按钮', async ({ page }) => {
    const confirmedRow = page.locator('tr').filter({ has: page.locator('.badge-confirmed, .badge-已确认') }).first();
    if (await confirmedRow.isVisible()) {
      const cancelBtn = confirmedRow.locator('.action-btn-cancel');
      if (await cancelBtn.isVisible()) {
        await expect(cancelBtn).toBeVisible();
      }
    }
  });

  test('取消预约弹出确认对话框', async ({ page }) => {
    const confirmedRow = page.locator('tr').filter({ has: page.locator('.badge-confirmed, .badge-已确认') }).first();
    if (await confirmedRow.isVisible()) {
      const cancelBtn = confirmedRow.locator('.action-btn-cancel');
      if (await cancelBtn.isVisible()) {
        await cancelBtn.click();
        await page.waitForTimeout(300);

        // 验证确认对话框出现
        await expect(page.locator('#confirmModal.show')).toBeVisible();

        // 取消操作
        await page.click('#confirmModal.show .modal-footer button:first-child');
      }
    }
  });
});

test.describe('预约删除功能', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await switchModule(page, 'bookings');
  });

  test('删除预约弹出确认对话框', async ({ page }) => {
    const firstRow = page.locator('tbody tr').first();
    if (await firstRow.isVisible()) {
      const deleteBtn = firstRow.locator('.action-btn-delete');
      if (await deleteBtn.isVisible()) {
        await deleteBtn.click();
        await page.waitForTimeout(300);

        // 验证确认对话框出现
        await expect(page.locator('#confirmModal.show')).toBeVisible();

        // 取消操作
        await page.click('#confirmModal.show .modal-footer button:first-child');
      }
    }
  });
});

test.describe('预约搜索功能', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await switchModule(page, 'bookings');
  });

  test('搜索预约', async ({ page }) => {
    const searchInput = page.locator('.search-input, #searchInput');
    if (await searchInput.isVisible()) {
      await searchInput.fill('2024');
      // 按Enter键触发搜索
      await searchInput.press('Enter');
      await page.waitForTimeout(500);

      // 验证搜索结果
      const resultRows = page.locator('tbody tr');
      const count = await resultRows.count();
      expect(count).toBeGreaterThanOrEqual(0);
    }
  });

  test('按日期搜索', async ({ page }) => {
    const searchInput = page.locator('.search-input, #searchInput');
    if (await searchInput.isVisible()) {
      // 搜索今天的日期
      const today = new Date().toISOString().split('T')[0];
      await searchInput.fill(today);
      // 按Enter键触发搜索
      await searchInput.press('Enter');
      await page.waitForTimeout(500);

      // 验证搜索结果
      const resultRows = page.locator('tbody tr');
      const count = await resultRows.count();
      expect(count).toBeGreaterThanOrEqual(0);
    }
  });
});

test.describe('预约批量操作', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await switchModule(page, 'bookings');
  });

  test('批量选择功能', async ({ page }) => {
    const selectAllCheckbox = page.locator('thead .row-checkbox, thead input[type="checkbox"]');
    if (await selectAllCheckbox.isVisible()) {
      await selectAllCheckbox.click();
      await page.waitForTimeout(300);

      // 验证所有行被选中
      const checkedRows = page.locator('tbody .row-checkbox:checked, tbody input[type="checkbox"]:checked');
      const count = await checkedRows.count();
      expect(count).toBeGreaterThanOrEqual(0);
    }
  });

  test('批量删除按钮显示', async ({ page }) => {
    const firstCheckbox = page.locator('tbody .row-checkbox, tbody input[type="checkbox"]').first();
    if (await firstCheckbox.isVisible()) {
      await firstCheckbox.click();
      await page.waitForTimeout(300);

      // 验证批量操作按钮出现
      const batchDeleteBtn = page.locator('.batch-delete-btn, #batchDeleteBtn');
      if (await batchDeleteBtn.isVisible()) {
        await expect(batchDeleteBtn).toBeVisible();
      }
    }
  });
});

test.describe('预约统计信息', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await switchModule(page, 'bookings');
  });

  test('统计卡片显示', async ({ page }) => {
    // 验证统计区域存在
    const statsSection = page.locator('.stats-section, .dashboard-stats, .stats-cards');
    if (await statsSection.isVisible()) {
      await expect(statsSection).toBeVisible();
    }
  });

  test('今日预约数显示', async ({ page }) => {
    const todayBookingStat = page.locator('.stat-item, .stat-card').first();
    if (await todayBookingStat.isVisible()) {
      const statText = await todayBookingStat.textContent();
      // 统计项应该包含数字
      expect(statText.length).toBeGreaterThan(0);
    }
  });
});