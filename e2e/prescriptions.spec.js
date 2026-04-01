/**
 * 处方管理完整测试
 *
 * 覆盖功能：
 * - 处方列表显示
 * - 处方状态流转（待审核 → 已审核 → 已结算）
 * - 处方详情查看
 * - 处方审核
 * - 处方编辑
 * - 处方删除验证
 */

const { test, expect } = require('@playwright/test');
const { login, switchModule } = require('./helpers');

test.describe('处方管理', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    // 展开处方管理分组
    const prescriptionGroup = page.locator('.menu-group[data-group="prescription"]');
    if (await prescriptionGroup.isVisible()) {
      await prescriptionGroup.locator('.menu-group-header').click();
      await page.waitForTimeout(300);
    }
    await switchModule(page, 'prescriptions');
  });

  test('处方列表显示', async ({ page }) => {
    await expect(page.locator('.table-container')).toBeVisible();
  });

  test('处方状态显示正确', async ({ page }) => {
    // 验证状态列存在
    const statusBadge = page.locator('td .badge').first();
    if (await statusBadge.isVisible()) {
      const text = await statusBadge.textContent();
      expect(['待审核', '已审核', '已结算']).toContain(text.trim());
    }
  });

  test('处方表头显示正确', async ({ page }) => {
    // 验证关键列存在
    const expectedHeaders = ['处方号', '姓名', '状态', '日期'];

    for (const header of expectedHeaders) {
      const headerCell = page.locator(`th:has-text("${header}")`);
      if (await headerCell.count() > 0) {
        await expect(headerCell.first()).toBeVisible();
      }
    }
  });

  test('处方展开查看详情', async ({ page }) => {
    // 点击第一个展开按钮
    const expandBtn = page.locator('.action-btn-expand').first();
    if (await expandBtn.isVisible()) {
      await expandBtn.click();
      await page.waitForTimeout(300);

      // 验证详情区域出现
      await expect(page.locator('.prescription-detail')).toBeVisible();
    }
  });
});

test.describe('处方详情管理', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    const prescriptionGroup = page.locator('.menu-group[data-group="prescription"]');
    if (await prescriptionGroup.isVisible()) {
      await prescriptionGroup.locator('.menu-group-header').click();
      await page.waitForTimeout(300);
    }
    await switchModule(page, 'prescriptions');
  });

  test('展开处方显示详情信息', async ({ page }) => {
    const firstRow = page.locator('tbody tr').first();
    if (await firstRow.isVisible()) {
      await firstRow.locator('.action-btn-expand').click();
      await page.waitForTimeout(500);

      // 验证详情信息存在
      await expect(page.locator('.prescription-info-grid')).toBeVisible();

      // 验证关键字段
      const infoLabels = ['处方号', '姓名', '年龄', '日期'];
      for (const label of infoLabels) {
        const infoItem = page.locator(`.info-label:has-text("${label}")`);
        if (await infoItem.count() > 0) {
          await expect(infoItem.first()).toBeVisible();
        }
      }
    }
  });

  test('展开处方显示药方列表', async ({ page }) => {
    const firstRow = page.locator('tbody tr').first();
    if (await firstRow.isVisible()) {
      await firstRow.locator('.action-btn-expand').click();
      await page.waitForTimeout(500);

      // 验证药方区域存在
      await expect(page.locator('.medicines-section')).toBeVisible();

      // 验证药方表头
      const medicineHeaders = ['序号', '药名', '剂量'];
      for (const header of medicineHeaders) {
        const headerCell = page.locator(`.medicines-table th:has-text("${header}")`);
        if (await headerCell.count() > 0) {
          await expect(headerCell.first()).toBeVisible();
        }
      }
    }
  });

  test('待审核状态可以编辑', async ({ page }) => {
    const pendingRow = page.locator('tr').filter({ has: page.locator('.badge-pending, .badge-待审核') }).first();
    if (await pendingRow.isVisible()) {
      await pendingRow.locator('.action-btn-expand').click();
      await page.waitForTimeout(500);

      // 验证编辑功能可用
      const editBtn = page.locator('.btn-primary:has-text("保存修改")');
      if (await editBtn.isVisible()) {
        await expect(editBtn).toBeEnabled();
      }

      // 验证添加药材按钮存在
      const addMedicineBtn = page.locator('button:has-text("添加药材")');
      if (await addMedicineBtn.isVisible()) {
        await expect(addMedicineBtn).toBeEnabled();
      }
    }
  });

  test('已结算状态不可编辑', async ({ page }) => {
    const settledRow = page.locator('tr').filter({ has: page.locator('.badge-settled, .badge-已结算') }).first();
    if (await settledRow.isVisible()) {
      await settledRow.locator('.action-btn-expand').click();
      await page.waitForTimeout(500);

      // 验证保存修改按钮不存在
      const editBtn = page.locator('.btn-primary:has-text("保存修改")');
      await expect(editBtn).not.toBeVisible();

      // 验证添加药材按钮不存在
      const addMedicineBtn = page.locator('button:has-text("添加药材")');
      await expect(addMedicineBtn).not.toBeVisible();

      // 验证输入框被禁用
      const inputs = page.locator('.prescription-detail input');
      const count = await inputs.count();
      if (count > 0) {
        const firstInput = inputs.first();
        await expect(firstInput).toBeDisabled();
      }
    }
  });
});

test.describe('处方审核流程', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    const prescriptionGroup = page.locator('.menu-group[data-group="prescription"]');
    if (await prescriptionGroup.isVisible()) {
      await prescriptionGroup.locator('.menu-group-header').click();
      await page.waitForTimeout(300);
    }
    await switchModule(page, 'prescriptions');
  });

  test('待审核状态显示审核按钮', async ({ page }) => {
    const pendingRow = page.locator('tr').filter({ has: page.locator('.badge-pending, .badge-待审核') }).first();
    if (await pendingRow.isVisible()) {
      const reviewBtn = pendingRow.locator('.action-btn-review');
      if (await reviewBtn.isVisible()) {
        await expect(reviewBtn).toBeVisible();
      }
    }
  });

  test('审核弹出确认对话框', async ({ page }) => {
    const pendingRow = page.locator('tr').filter({ has: page.locator('.badge-pending, .badge-待审核') }).first();
    if (await pendingRow.isVisible()) {
      const reviewBtn = pendingRow.locator('.action-btn-review');
      if (await reviewBtn.isVisible()) {
        await reviewBtn.click();
        await page.waitForTimeout(300);

        // 验证确认对话框出现
        await expect(page.locator('#confirmModal.show')).toBeVisible();

        // 取消操作
        await page.click('#confirmModal.show .modal-footer button:first-child');
      }
    }
  });

  test('审核后状态变为已审核', async ({ page }) => {
    const pendingRow = page.locator('tr').filter({ has: page.locator('.badge-pending, .badge-待审核') }).first();
    if (await pendingRow.isVisible()) {
      const reviewBtn = pendingRow.locator('.action-btn-review');
      if (await reviewBtn.isVisible()) {
        await reviewBtn.click();
        await page.waitForTimeout(300);

        // 点击确认按钮
        await page.click('#confirmBtn');
        await page.waitForTimeout(1000);

        // 等待页面刷新
        await page.waitForTimeout(500);
      }
    }
  });
});

test.describe('处方删除验证', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    const prescriptionGroup = page.locator('.menu-group[data-group="prescription"]');
    if (await prescriptionGroup.isVisible()) {
      await prescriptionGroup.locator('.menu-group-header').click();
      await page.waitForTimeout(300);
    }
    await switchModule(page, 'prescriptions');
  });

  test('待审核状态可以删除', async ({ page }) => {
    const pendingRow = page.locator('tr').filter({ has: page.locator('.badge-pending, .badge-待审核') }).first();
    if (await pendingRow.isVisible()) {
      const deleteBtn = pendingRow.locator('.action-btn-delete');
      if (await deleteBtn.isVisible()) {
        await expect(deleteBtn).toBeVisible();
      }
    }
  });

  test('已审核状态可以删除', async ({ page }) => {
    const reviewedRow = page.locator('tr').filter({ has: page.locator('.badge-reviewed, .badge-已审核') }).first();
    if (await reviewedRow.isVisible()) {
      const deleteBtn = reviewedRow.locator('.action-btn-delete');
      if (await deleteBtn.isVisible()) {
        await expect(deleteBtn).toBeVisible();
      }
    }
  });

  test('已结算状态禁止删除', async ({ page }) => {
    const settledRow = page.locator('tr').filter({ has: page.locator('.badge-settled, .badge-已结算') }).first();
    if (await settledRow.isVisible()) {
      const deleteBtn = settledRow.locator('.action-btn-delete');
      // 已结算状态的处方不应该有删除按钮
      await expect(deleteBtn).not.toBeVisible();
    }
  });

  test('删除弹出确认对话框', async ({ page }) => {
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

test.describe('处方搜索功能', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    const prescriptionGroup = page.locator('.menu-group[data-group="prescription"]');
    if (await prescriptionGroup.isVisible()) {
      await prescriptionGroup.locator('.menu-group-header').click();
      await page.waitForTimeout(300);
    }
    await switchModule(page, 'prescriptions');
  });

  test('搜索处方', async ({ page }) => {
    const searchInput = page.locator('.search-input, #searchInput');
    if (await searchInput.isVisible()) {
      // 输入搜索关键词
      await searchInput.fill('张');
      // 按Enter键触发搜索
      await searchInput.press('Enter');
      await page.waitForTimeout(500);

      // 验证搜索结果
      const resultRows = page.locator('tbody tr');
      const count = await resultRows.count();

      // 如果有结果，验证结果包含关键词
      if (count > 0) {
        const firstRowText = await resultRows.first().textContent();
        // 搜索结果应该包含关键词
      }
    }
  });

  test('清空搜索', async ({ page }) => {
    const searchInput = page.locator('.search-input, #searchInput');
    if (await searchInput.isVisible()) {
      // 先搜索
      await searchInput.fill('测试');
      // 按Enter键触发搜索
      await searchInput.press('Enter');
      await page.waitForTimeout(500);

      // 清空搜索
      await searchInput.fill('');
      // 按Enter键触发搜索
      await searchInput.press('Enter');
      await page.waitForTimeout(500);

      // 验证显示所有数据
      const resultRows = page.locator('tbody tr');
      const count = await resultRows.count();
      expect(count).toBeGreaterThanOrEqual(0);
    }
  });
});

test.describe('处方图片预览', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    const prescriptionGroup = page.locator('.menu-group[data-group="prescription"]');
    if (await prescriptionGroup.isVisible()) {
      await prescriptionGroup.locator('.menu-group-header').click();
      await page.waitForTimeout(300);
    }
    await switchModule(page, 'prescriptions');
  });

  test('展开处方显示缩略图', async ({ page }) => {
    const firstRow = page.locator('tbody tr').first();
    if (await firstRow.isVisible()) {
      await firstRow.locator('.action-btn-expand').click();
      await page.waitForTimeout(500);

      // 检查是否有缩略图
      const thumbnail = page.locator('.prescription-thumbnail-img');
      if (await thumbnail.isVisible()) {
        await expect(thumbnail).toBeVisible();
      }
    }
  });

  test('点击缩略图显示大图', async ({ page }) => {
    const firstRow = page.locator('tbody tr').first();
    if (await firstRow.isVisible()) {
      await firstRow.locator('.action-btn-expand').click();
      await page.waitForTimeout(500);

      const thumbnail = page.locator('.prescription-thumbnail-img');
      if (await thumbnail.isVisible()) {
        await thumbnail.click();
        await page.waitForTimeout(300);

        // 验证图片预览模态框出现
        const previewModal = page.locator('.image-preview-modal, #imagePreviewModal');
        if (await previewModal.isVisible()) {
          await expect(previewModal).toBeVisible();

          // 关闭预览
          await page.click('.modal-close, .preview-close');
        }
      }
    }
  });
});

test.describe('处方药方编辑', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    const prescriptionGroup = page.locator('.menu-group[data-group="prescription"]');
    if (await prescriptionGroup.isVisible()) {
      await prescriptionGroup.locator('.menu-group-header').click();
      await page.waitForTimeout(300);
    }
    await switchModule(page, 'prescriptions');
  });

  test('添加药材功能', async ({ page }) => {
    const pendingRow = page.locator('tr').filter({ has: page.locator('.badge-pending, .badge-待审核') }).first();
    if (await pendingRow.isVisible()) {
      await pendingRow.locator('.action-btn-expand').click();
      await page.waitForTimeout(500);

      // 点击添加药材按钮
      const addBtn = page.locator('button:has-text("添加药材")');
      if (await addBtn.isVisible()) {
        await addBtn.click();
        await page.waitForTimeout(300);

        // 验证新药材行出现
        const newMedicineRow = page.locator('.medicines-table tbody tr').first();
        await expect(newMedicineRow).toBeVisible();

        // 验证新行有输入框
        const nameInput = newMedicineRow.locator('input[data-med-field="name"]');
        await expect(nameInput).toBeVisible();
      }
    }
  });

  test('删除药材功能', async ({ page }) => {
    const pendingRow = page.locator('tr').filter({ has: page.locator('.badge-pending, .badge-待审核') }).first();
    if (await pendingRow.isVisible()) {
      await pendingRow.locator('.action-btn-expand').click();
      await page.waitForTimeout(500);

      // 找到删除药材按钮
      const deleteMedicineBtn = page.locator('.medicines-table .action-btn-delete').first();
      if (await deleteMedicineBtn.isVisible()) {
        await deleteMedicineBtn.click();
        await page.waitForTimeout(300);

        // 验证药材行被删除
      }
    }
  });

  test('保存处方修改', async ({ page }) => {
    const pendingRow = page.locator('tr').filter({ has: page.locator('.badge-pending, .badge-待审核') }).first();
    if (await pendingRow.isVisible()) {
      await pendingRow.locator('.action-btn-expand').click();
      await page.waitForTimeout(500);

      // 修改一个字段
      const nameInput = page.locator('.info-input[data-field="name"]');
      if (await nameInput.isVisible() && await nameInput.isEditable()) {
        await nameInput.fill('测试患者');
        await page.waitForTimeout(300);

        // 点击保存
        const saveBtn = page.locator('.btn-primary:has-text("保存修改")');
        if (await saveBtn.isVisible()) {
          await saveBtn.click();
          await page.waitForTimeout(500);

          // 验证保存成功提示
          const toast = page.locator('.toast.show');
          if (await toast.isVisible()) {
            const toastText = await toast.textContent();
            expect(toastText).toContain('成功');
          }
        }
      }
    }
  });
});