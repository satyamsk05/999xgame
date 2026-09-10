const express = require('express');
const router = express.Router();
const { adminMiddleware, requireRole } = require('../middleware/admin_auth.middleware');
const { query } = require('../database/db');
const logger = require('../utils/logger');

router.use(adminMiddleware);

router.get('/dashboard', requireRole('SUPER_ADMIN', 'FINANCE_ADMIN', 'SUPPORT_ADMIN', 'GAME_ADMIN'), async (req, res, next) => {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayISO = todayStart.toISOString();
    const [usersRes,newUsersRes,depositsRes,pendingDepositsRes,withdrawalsRes,pendingWithdrawalsRes,betsRes,revenueRes,activeRoundRes] = await Promise.all([
      query('SELECT COUNT(*) AS total FROM users'),
      query('SELECT COUNT(*) AS total FROM users WHERE created_at >= $1',[todayISO]),
      query(`SELECT COUNT(*) AS count, COALESCE(SUM(amount),0) AS total FROM deposits WHERE status='CONFIRMED' AND confirmed_at >= $1`,[todayISO]),
      // Schema uses UTR_SUBMITTED; PENDING_UTR was a legacy dashboard value and returned zero.
      query(`SELECT COUNT(*) AS count FROM deposits WHERE status IN ('PENDING','UTR_SUBMITTED')`),
      query(`SELECT COUNT(*) AS count, COALESCE(SUM(amount),0) AS total FROM withdrawals WHERE status='SUCCESS' AND completed_at >= $1`,[todayISO]),
      query(`SELECT COUNT(*) AS count FROM withdrawals WHERE status IN ('PENDING','PROCESSING')`),
      query(`SELECT COUNT(*) AS count, COALESCE(SUM(stake),0) AS staked FROM bets WHERE created_at >= $1`,[todayISO]),
      query(`SELECT COALESCE(SUM(stake),0) AS staked, COALESCE(SUM(win_amount),0) AS paid_out FROM bets WHERE created_at >= $1 AND status IN ('WON','LOST')`,[todayISO]),
      query(`SELECT id,round_number,status,created_at FROM game_rounds WHERE status IN ('CREATED','BETTING_OPEN','BETTING_CLOSED','ROLLING','FLYING') ORDER BY created_at DESC LIMIT 1`),
    ]);
    const staked=parseInt(revenueRes.rows[0]?.staked||0,10); const paidOut=parseInt(revenueRes.rows[0]?.paid_out||0,10);
    res.status(200).json({status:'success',data:{
      users:{total:parseInt(usersRes.rows[0]?.total||0,10),newToday:parseInt(newUsersRes.rows[0]?.total||0,10)},
      deposits:{todayCount:parseInt(depositsRes.rows[0]?.count||0,10),todayTotal:parseInt(depositsRes.rows[0]?.total||0,10)/100,pendingCount:parseInt(pendingDepositsRes.rows[0]?.count||0,10)},
      withdrawals:{todayCount:parseInt(withdrawalsRes.rows[0]?.count||0,10),todayTotal:parseInt(withdrawalsRes.rows[0]?.total||0,10)/100,pendingCount:parseInt(pendingWithdrawalsRes.rows[0]?.count||0,10)},
      bets:{todayCount:parseInt(betsRes.rows[0]?.count||0,10),todayStaked:parseInt(betsRes.rows[0]?.staked||0,10)/100},
      revenue:{todayHouseRevenue:(staked-paidOut)/100},currentRound:activeRoundRes.rows[0]||null,generatedAt:new Date().toISOString()
    }});
  } catch(err) { logger.error('Failed to aggregate admin dashboard stats',{error:err.message}); next(err); }
});

router.get('/audit-logs', requireRole('SUPER_ADMIN'), async (req,res,next)=>{
  try {
    const rawLimit=Number.parseInt(req.query.limit||'50',10); const rawOffset=Number.parseInt(req.query.offset||'0',10);
    const limit=Number.isFinite(rawLimit)?Math.max(1,Math.min(rawLimit,200)):50; const offset=Number.isFinite(rawOffset)?Math.max(0,rawOffset):0; const action=String(req.query.action||'');
    const sql=action?`SELECT * FROM audit_logs WHERE action=$1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`:`SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT $1 OFFSET $2`;
    const params=action?[action,limit,offset]:[limit,offset];
    const [result,countRes]=await Promise.all([query(sql,params),query(action?'SELECT COUNT(*) FROM audit_logs WHERE action=$1':'SELECT COUNT(*) FROM audit_logs',action?[action]:[])]);
    res.json({status:'success',data:result.rows,meta:{total:parseInt(countRes.rows[0]?.count||0,10),limit,offset}});
  } catch(err){next(err);}
});
module.exports=router;
