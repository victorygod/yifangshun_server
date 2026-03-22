const { Booking, User, ScheduleConfig } = require('./wrappers/db-wrapper');

async function debug() {
  try {
    console.log('=== 开始调试 booking phone 字段问题 ===\n');
    
    // 1. 清理旧数据
    console.log('1. 清理旧数据...');
    await Booking.destroy({ where: {}, truncate: true });
    await User.destroy({ where: {}, truncate: true });
    await ScheduleConfig.destroy({ where: {}, truncate: true });
    
    // 2. 创建测试用户
    console.log('\n2. 创建测试用户...');
    const testUser = await User.create({
      openid: 'test_debug_user',
      phone: '13800138000',
      role: 'user',
      name: '测试用户'
    });
    console.log('   用户创建成功:', { openid: testUser.openid, phone: testUser.phone });
    
    // 3. 创建预约（模拟 services/booking.js 的逻辑）
    console.log('\n3. 创建预约...');
    const openid = 'test_debug_user';
    const user = await User.findOne({ where: { openid } });
    const phone = user ? user.phone : null;
    console.log('   查询到的手机号:', phone);
    
    const booking = await Booking.create({
      openid,
      phone,
      date: '2026-04-01',
      session: 'afternoon',
      personCount: 1,
      status: 'confirmed',
      time: '14:00'
    });
    console.log('   预约创建成功:', { 
      id: booking.id, 
      openid: booking.openid, 
      phone: booking.phone,
      date: booking.date 
    });
    
    // 4. 验证取消逻辑（模拟 cancelBooking）
    console.log('\n4. 验证取消逻辑...');
    const retrievedBooking = await Booking.findOne({ where: { id: booking.id } });
    console.log('   从数据库读取的 booking:', {
      id: retrievedBooking.id,
      openid: retrievedBooking.openid,
      phone: retrievedBooking.phone
    });
    
    const userInfo = { openid: 'test_debug_user', phone: '13800138000' };
    const userPhone = userInfo.phone;
    
    console.log('   比较:', {
      'booking.phone': retrievedBooking.phone,
      'userInfo.phone': userPhone,
      '是否相等': retrievedBooking.phone === userPhone
    });
    
    if (retrievedBooking.phone !== userPhone) {
      console.log('   ❌ 权限验证失败：无权取消该预约');
    } else {
      console.log('   ✅ 权限验证通过');
      // 执行取消
      await Booking.destroy({ where: { id: booking.id } });
      console.log('   预约已取消');
    }
    
    // 5. 再次查询验证
    console.log('\n5. 验证取消结果...');
    const cancelledBooking = await Booking.findOne({ where: { id: booking.id } });
    console.log('   数据库中该预约:', cancelledBooking ? '存在' : '已删除');
    
    console.log('\n=== 调试完成 ===');
  } catch (error) {
    console.error('调试出错:', error);
  } finally {
    // 清理
    await Booking.destroy({ where: {}, truncate: true });
    await User.destroy({ where: {}, truncate: true });
    await ScheduleConfig.destroy({ where: {}, truncate: true });
    process.exit(0);
  }
}

debug();
