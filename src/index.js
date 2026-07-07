require('dotenv').config()
const { Client, GatewayIntentBits, Partials, EmbedBuilder, REST, Routes, SlashCommandBuilder } = require('discord.js')
const mysql = require('mysql2/promise')
const crypto = require('crypto')

// ═══ CONFIG ═══
const TOKEN = process.env.DISCORD_TOKEN
const CLIENT_ID = '1520517550386184243'
const OWNER_NICK = process.env.OWNER_NICK || 'Nodirbek_Hatred'

const CH_SERVER_NEWS = '1500773549554798602'
const CH_ADMIN_NEWS  = '1500945593407639715'
const CH_GAME_CHAT   = '1501055278827704551'
const CH_PUNISHMENTS = '1501081847046865057'
const GUILD_MAIN     = '1500771666027085836'
const GUILD_ADMIN    = '1500945591281258729'
const ROLE_MEMBER    = '1500772487896629298'
const ROLE_ADMIN     = '1500953705405485158'

// ═══ EMOJI - to'g'ri format ═══
const E = {
  ok:       '<:ok:1520802211498688702>',
  reject:   '<:reject:1520802491783188500>',
  warn:     '<:warn:1520803081359458364>',
  notfound: '<:notfound:1522565876812087398>',
  id:       '<:id:1523056367336821009>',
  ban:      '<:ban:1523058258682581042>',
  unban:    '<:unban:1523059170893631660>',
  mute:     '<:mute:1523288547363389551>',
  unmute:   '<:unmute:1523059170893631660>',
  kick:     '<:kick:1523282874407714888>',
  jail:     '<:jail:1523283153869996053>',
  unjail:   '<:unjail:1523059170893631660>',
  online:   '<:online:1523283780423389324>',
  profil:   '<:profil:1523286982472503487>',
  top1:     '<:top1:1523284198528520272>',
  top2:     '<:top2:1523284428242157618>',
  top3:     '<:top3:1523284426413572196>',
  active:   '<:active:1523284839866957824>',
  news:     '<:news:1523285795547381760>',
  register: '<:register:1523285978028965979>',
  server:   '<:server:1523286648975265872>',
  admin:    '<:admin:1523287844196450304>',
  mtake:    '<:mtake:1523288239333576724>',
  mgive:    '<:mgive:1523288239333576724>',
  transfer: '<:transfer:1523288748438192160>',
  fraksiya: '<:fraksiya:1523290263840100433>',
}

// ═══ DB ═══
const GAME_DB = {
  host:'188.127.241.8', port:3306,
  user:'gs137892', password:'XFpWuN7kssXj',
  database:'gs137892', waitForConnections:true, connectionLimit:10, connectTimeout:15000
}
const SITE_DB = {
  host: process.env.SITE_DB_HOST||'zephyr.proxy.rlwy.net',
  port: parseInt(process.env.SITE_DB_PORT||'35377'),
  user: process.env.SITE_DB_USER||'root',
  password: process.env.SITE_DB_PASS||'HQMqKjcxPaoAXsaqNdrMRhcFRzPusZhj',
  database: process.env.SITE_DB_NAME||'railway',
  waitForConnections:true, connectionLimit:5, connectTimeout:20000
}

let gamePool, sitePool
const pendingVerify = new Map()
const pendingRegister = new Map()

// ═══ DB INIT ═══
async function initDB() {
  try { gamePool = mysql.createPool(GAME_DB); await gamePool.query('SELECT 1'); console.log('✅ Game DB ulandi!') }
  catch(e) { console.error('❌ Game DB:', e.message) }
  for (let i=0; i<3; i++) {
    try {
      sitePool = mysql.createPool(SITE_DB); await sitePool.query('SELECT 1')
      console.log('✅ Site DB ulandi!'); await createTables(); return
    } catch(e) { console.error(`❌ Site DB ${i+1}:`, e.message); await new Promise(r=>setTimeout(r,4000)) }
  }
  console.error('❌ Site DB ulanmadi!')
}

async function createTables() {
  const sqls = [
    `CREATE TABLE IF NOT EXISTS admin_dc_users (id INT AUTO_INCREMENT PRIMARY KEY, player_name VARCHAR(64) NOT NULL UNIQUE, dc_user_id VARCHAR(64) UNIQUE, dc_username VARCHAR(64), is_verified TINYINT DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS admin_activity (id INT AUTO_INCREMENT PRIMARY KEY, player_name VARCHAR(64) NOT NULL, online_minutes INT DEFAULT 0, reports_checked INT DEFAULT 0, complaints_closed INT DEFAULT 0, punishments_given INT DEFAULT 0, date DATE NOT NULL, UNIQUE KEY dp (player_name, date)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS muted_dc_users (id INT AUTO_INCREMENT PRIMARY KEY, dc_user_id VARCHAR(64) NOT NULL UNIQUE, muted_until DATETIME NOT NULL, reason TEXT) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS punishment_logs (id INT AUTO_INCREMENT PRIMARY KEY, admin_nick VARCHAR(64), player_nick VARCHAR(64), type VARCHAR(32), reason TEXT, duration VARCHAR(32), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  ]
  for (const sql of sqls) await sitePool.query(sql).catch(()=>{})
  console.log('✅ Jadvallar tayyor!')
}

// ═══ HELPERS ═══
const fmt = v => Number(v||0).toLocaleString('ru-RU')
const today = () => new Date().toISOString().split('T')[0]
const teamNames = {0:'Fuqaro',1:'Politsiya',2:'Tibbiyot',3:'Armiya',4:'SWAT',5:'FIB',6:'Sheriff',7:"Yong'inchi",8:'Mehnat',9:"Yo'l xizmati"}
const adminLvl = {0:"O'yinchi",1:'Yangi Admin',2:'Admin',3:'Senior Admin',4:'Bosh Admin',5:'Co-Owner',6:'Super Admin',13:'Owner'}
const medal = i => i===0?E.top1:i<3?E.top2:E.top3
const parseEmoji = t => t.replace(/\{(\d+)\}/g,(_,id)=>`<:e${id}:${id}>`)

// Parol tekshirish - bir necha hash usuli
async function checkPassword(pass, hash, salt) {
  const checks = [
    () => crypto.createHash('sha256').update(pass+salt).digest('hex').toUpperCase(),
    () => crypto.createHash('sha256').update(pass+salt).digest('hex'),
    () => crypto.createHash('md5').update(pass+salt).digest('hex').toUpperCase(),
    () => crypto.createHash('sha256').update(pass).digest('hex').toUpperCase(),
    () => crypto.createHash('md5').update(pass).digest('hex').toUpperCase(),
    () => crypto.createHash('sha256').update(crypto.createHash('md5').update(pass).digest('hex')+salt).digest('hex').toUpperCase(),
  ]
  for (const fn of checks) { try { if (fn()===hash) return true } catch {} }
  return false
}

async function getPlayer(nameOrId) {
  try {
    if (/^\d+$/.test(String(nameOrId))) {
      const [r] = await gamePool.query('SELECT * FROM accounts WHERE id=?',[nameOrId])
      if (r[0]) return r[0]
    }
    const [r] = await gamePool.query('SELECT * FROM accounts WHERE name=?',[nameOrId])
    return r[0]||null
  } catch { return null }
}

async function getDcUser(dcId) {
  try {
    if (!sitePool) return null
    const [r] = await sitePool.query('SELECT * FROM admin_dc_users WHERE dc_user_id=? AND is_verified=1',[dcId])
    return r[0]||null
  } catch { return null }
}

async function sendGameCmd(cmd) {
  if (!sitePool) return
  await sitePool.query("INSERT INTO settings(setting_key,setting_value) VALUES('dc_game_command',?) ON DUPLICATE KEY UPDATE setting_value=?",[cmd,cmd]).catch(()=>{})
}

// Jazo berish + log + game command
async function doPunish(adminInfo, target, type, reason, duration, client) {
  // 1. Game botga buyruq
  const onlineTypes = {
    BAN:`ban:${target.name}::${reason}`,
    UNBAN:`unban:${target.name}::`,
    KICK:`kick:${target.name}::${reason}`,
    MUTE:`mute:${target.name}:${duration||30}:${reason}`,
    UNMUTE:`unmute:${target.name}::`,
    WARN:`warn:${target.name}::${reason}`,
    UNWARN:`unwarn:${target.name}::`,
    JAIL:`jail:${target.name}:${duration||30}:${reason}`,
    UNJAIL:`unjail:${target.name}::`,
  }
  if (onlineTypes[type]) await sendGameCmd(onlineTypes[type])

  // 2. Punishment kanali
  try {
    const ch = await client.channels.fetch(CH_PUNISHMENTS).catch(()=>null)
    if (ch) {
      let adminMention = `**${adminInfo.name}**`
      if (sitePool) {
        const [dc] = await sitePool.query('SELECT dc_user_id FROM admin_dc_users WHERE player_name=? AND is_verified=1',[adminInfo.name]).catch(()=>[[]])
        if (dc[0]?.dc_user_id) adminMention = `<@${dc[0].dc_user_id}>`
      }
      const typeEmoji = {BAN:E.ban,UNBAN:E.unban,KICK:E.kick,MUTE:E.mute,UNMUTE:E.unmute,WARN:E.warn,UNWARN:E.ok,JAIL:E.jail,UNJAIL:E.unjail,OFFBAN:E.ban,OFFMUTE:E.mute,OFFWARN:E.warn,OFFJAIL:E.jail,OFFUNJAIL:E.unjail}
      const typeColor = {BAN:0xEF4444,KICK:0xF59E0B,MUTE:0x9D4EDD,WARN:0xF59E0B,JAIL:0xEF4444,OFFBAN:0xEF4444}
      const embed = new EmbedBuilder()
        .setColor(typeColor[type]||0x9D4EDD)
        .setTitle(`${typeEmoji[type]||'⚖️'} ${type} — ${target.name||target}`)
        .addFields(
          {name:`${E.admin} Admin`, value:adminMention, inline:true},
          {name:`${E.profil} Oyinchi`, value:`**${target.name||target}** (ID: ${target.id||'?'})`, inline:true},
          {name:'📋 Sabab', value:reason||"Ko'rsatilmagan"},
          ...(duration?[{name:'⏱️ Vaqt',value:`${duration}`,inline:true}]:[])
        ).setTimestamp()
      await ch.send({embeds:[embed]})
    }
  } catch(e) { console.error('Jazo log xatosi:', e.message) }

  // 3. DB log
  if (sitePool) {
    await sitePool.query('INSERT INTO punishment_logs(admin_nick,player_nick,type,reason,duration) VALUES(?,?,?,?,?)',
      [adminInfo.name,target.name||target,type,reason,duration||null]).catch(()=>{})
    await sitePool.query('INSERT INTO admin_activity(player_name,date,punishments_given) VALUES(?,?,1) ON DUPLICATE KEY UPDATE punishments_given=punishments_given+1',
      [adminInfo.name,today()]).catch(()=>{})
  }
}

// ═══ EXP TIZIMI ═══
async function giveHourlyExp() {
  try {
    const [players] = await gamePool.query('SELECT id,name,level,score FROM accounts WHERE online=1')
    let count = 0
    for (const p of players) {
      const lvl = parseInt(p.level)||1
      const expNeeded = lvl * 3
      let score = (parseInt(p.score)||0) + 3
      let level = lvl

      // Level up
      while (score >= level*3) {
        score -= level*3
        level++
        await sendGameCmd(`ann:System:[EXP] ${p.name} yangi darajaga yetdi! Daraja: ${lvl} → ${level}`)
      }

      await gamePool.query('UPDATE accounts SET score=?,level=? WHERE id=?',[score,level,p.id])
      count++
    }
    console.log(`✅ EXP berildi! ${count} oyinchi`)
  } catch(e) { console.error('EXP xato:', e.message) }
}

// Har soat 00 daqiqada
function startTimers() {
  // EXP timer
  const now = new Date()
  const msToNext = (60-now.getMinutes())*60000 - now.getSeconds()*1000
  console.log(`⏱️ EXP ${Math.round(msToNext/60000)} daqiqadan keyin`)
  setTimeout(() => { giveHourlyExp(); setInterval(giveHourlyExp, 60*60*1000) }, msToNext)

  // Online vaqt tracker (har 5 daqiqa)
  setInterval(async () => {
    if (!sitePool) return
    try {
      const [admins] = await gamePool.query('SELECT name FROM accounts WHERE admin>0 AND online=1').catch(()=>[[]])
      for (const a of admins) {
        await sitePool.query('INSERT INTO admin_activity(player_name,date,online_minutes) VALUES(?,?,5) ON DUPLICATE KEY UPDATE online_minutes=online_minutes+5',
          [a.name,today()]).catch(()=>{})
      }
    } catch {}
  }, 5*60*1000)
}

// ═══ SLASH COMMANDS ═══
const commands = [
  new SlashCommandBuilder().setName('start').setDescription('Barcha buyruqlar'),
  new SlashCommandBuilder().setName('help').setDescription('Yordam'),
  new SlashCommandBuilder().setName('myid').setDescription('Discord ID'),
  new SlashCommandBuilder().setName('setdc').setDescription("Akkaunt bog'lash").addStringOption(o=>o.setName('nick').setDescription('Nick').setRequired(true)),
  new SlashCommandBuilder().setName('register').setDescription('Yangi akkaunt').addStringOption(o=>o.setName('nick').setDescription('Ism_Familiya').setRequired(true)).addStringOption(o=>o.setName('gmail').setDescription('Gmail (@gmail.com)').setRequired(true)),
  new SlashCommandBuilder().setName('profil').setDescription("O'z profil"),
  new SlashCommandBuilder().setName('online').setDescription('Onlayn oyinchilar'),
  new SlashCommandBuilder().setName('server').setDescription('Server info'),
  new SlashCommandBuilder().setName('mypul').setDescription('Mening pulim'),
  new SlashCommandBuilder().setName('transfer').setDescription("Pul o'tkazish").addStringOption(o=>o.setName('nick').setDescription('Nick').setRequired(true)).addIntegerOption(o=>o.setName('miqdor').setDescription('Miqdor').setRequired(true)),
  new SlashCommandBuilder().setName('top').setDescription('Reyting').addStringOption(o=>o.setName('tur').setDescription('level/money/score/hours').setRequired(false)),
  new SlashCommandBuilder().setName('toplevel').setDescription('Daraja top'),
  new SlashCommandBuilder().setName('topmoney').setDescription('Boylik top'),
  new SlashCommandBuilder().setName('topscore').setDescription('Score top'),
  new SlashCommandBuilder().setName('tophours').setDescription('Vaqt top'),
  // Admin
  new SlashCommandBuilder().setName('admins').setDescription('Adminlar [5+]'),
  new SlashCommandBuilder().setName('banlist').setDescription('Ban list [1+]'),
  new SlashCommandBuilder().setName('ban').setDescription('Ban [1+]').addStringOption(o=>o.setName('nick').setDescription('Nick/ID').setRequired(true)).addStringOption(o=>o.setName('vaqt').setDescription('Vaqt').setRequired(true)).addStringOption(o=>o.setName('sabab').setDescription('Sabab').setRequired(true)),
  new SlashCommandBuilder().setName('unban').setDescription('Unban [1+]').addStringOption(o=>o.setName('nick').setDescription('Nick').setRequired(true)),
  new SlashCommandBuilder().setName('mute').setDescription('Mute [1+]').addStringOption(o=>o.setName('nick').setDescription('Nick/ID').setRequired(true)).addIntegerOption(o=>o.setName('daqiqa').setDescription('Daqiqa').setRequired(true)).addStringOption(o=>o.setName('sabab').setDescription('Sabab').setRequired(true)),
  new SlashCommandBuilder().setName('unmute').setDescription('Unmute [1+]').addStringOption(o=>o.setName('nick').setDescription('Nick').setRequired(true)),
  new SlashCommandBuilder().setName('warn').setDescription('Warn [1+]').addStringOption(o=>o.setName('nick').setDescription('Nick/ID').setRequired(true)).addStringOption(o=>o.setName('sabab').setDescription('Sabab').setRequired(true)),
  new SlashCommandBuilder().setName('unwarn').setDescription('Unwarn [1+]').addStringOption(o=>o.setName('nick').setDescription('Nick').setRequired(true)),
  new SlashCommandBuilder().setName('kick').setDescription('Kick [1+]').addStringOption(o=>o.setName('nick').setDescription('Nick/ID').setRequired(true)).addStringOption(o=>o.setName('sabab').setDescription('Sabab').setRequired(true)),
  new SlashCommandBuilder().setName('jail').setDescription('Jail [1+]').addStringOption(o=>o.setName('nick').setDescription('Nick/ID').setRequired(true)).addIntegerOption(o=>o.setName('daqiqa').setDescription('Daqiqa').setRequired(true)).addStringOption(o=>o.setName('sabab').setDescription('Sabab').setRequired(true)),
  new SlashCommandBuilder().setName('unjail').setDescription('Unjail [1+]').addStringOption(o=>o.setName('nick').setDescription('Nick').setRequired(true)),
  // Offline
  new SlashCommandBuilder().setName('offban').setDescription('Offline Ban [1+]').addStringOption(o=>o.setName('nick').setDescription('Nick').setRequired(true)).addStringOption(o=>o.setName('kun').setDescription('Kun soni').setRequired(true)).addStringOption(o=>o.setName('sabab').setDescription('Sabab').setRequired(true)),
  new SlashCommandBuilder().setName('offmute').setDescription('Offline Mute [1+]').addStringOption(o=>o.setName('nick').setDescription('Nick').setRequired(true)).addIntegerOption(o=>o.setName('daqiqa').setDescription('Daqiqa').setRequired(true)).addStringOption(o=>o.setName('sabab').setDescription('Sabab').setRequired(true)),
  new SlashCommandBuilder().setName('offwarn').setDescription('Offline Warn [1+]').addStringOption(o=>o.setName('nick').setDescription('Nick').setRequired(true)).addStringOption(o=>o.setName('sabab').setDescription('Sabab').setRequired(true)),
  new SlashCommandBuilder().setName('offjail').setDescription('Offline Jail [1+]').addStringOption(o=>o.setName('nick').setDescription('Nick').setRequired(true)).addIntegerOption(o=>o.setName('daqiqa').setDescription('Daqiqa').setRequired(true)).addStringOption(o=>o.setName('sabab').setDescription('Sabab').setRequired(true)),
  new SlashCommandBuilder().setName('offunjail').setDescription('Offline Unjail [1+]').addStringOption(o=>o.setName('nick').setDescription('Nick').setRequired(true)),
  // Admin 5+
  new SlashCommandBuilder().setName('pul').setDescription('Pul berish [5+]').addStringOption(o=>o.setName('nick').setDescription('Nick/ID').setRequired(true)).addIntegerOption(o=>o.setName('miqdor').setDescription('Miqdor').setRequired(true)),
  new SlashCommandBuilder().setName('olpul').setDescription('Pul olish [5+]').addStringOption(o=>o.setName('nick').setDescription('Nick/ID').setRequired(true)).addIntegerOption(o=>o.setName('miqdor').setDescription('Miqdor').setRequired(true)),
  new SlashCommandBuilder().setName('setlevel').setDescription('Daraja [5+]').addStringOption(o=>o.setName('nick').setDescription('Nick/ID').setRequired(true)).addIntegerOption(o=>o.setName('daraja').setDescription('Daraja').setRequired(true)),
  new SlashCommandBuilder().setName('hp').setDescription('HP [1+]').addStringOption(o=>o.setName('nick').setDescription('Nick/ID').setRequired(true)).addIntegerOption(o=>o.setName('miqdor').setDescription('Miqdor').setRequired(true)),
  new SlashCommandBuilder().setName('heal').setDescription('Davolash [1+]').addStringOption(o=>o.setName('nick').setDescription('Nick/ID').setRequired(true)),
  new SlashCommandBuilder().setName('sendall').setDescription('Hammaga xabar [5+]').addStringOption(o=>o.setName('matn').setDescription('Xabar').setRequired(true)),
  new SlashCommandBuilder().setName('makeadmin').setDescription('Admin qilish [Owner]').addStringOption(o=>o.setName('nick').setDescription('Nick').setRequired(true)).addIntegerOption(o=>o.setName('daraja').setDescription('Admin darajasi (1-6)').setRequired(true)),
  new SlashCommandBuilder().setName('unadmin').setDescription("Admin'likdan olish [Owner]").addStringOption(o=>o.setName('nick').setDescription('Nick').setRequired(true)),
  // Aktivlik
  new SlashCommandBuilder().setName('myactive').setDescription('Mening aktivligim').addStringOption(o=>o.setName('davr').setDescription('today/week').setRequired(false)),
  new SlashCommandBuilder().setName('active').setDescription('Admin aktivligi [5+]').addStringOption(o=>o.setName('nick').setDescription('Nick').setRequired(true)).addStringOption(o=>o.setName('davr').setDescription('today/week').setRequired(false)),
  new SlashCommandBuilder().setName('activeall').setDescription('Barcha aktivlik [5+]').addStringOption(o=>o.setName('davr').setDescription('today/week').setRequired(false)),
  new SlashCommandBuilder().setName('topactive').setDescription('Top aktiv [5+]'),
  new SlashCommandBuilder().setName('report').setDescription('Reportlar [5+]').addStringOption(o=>o.setName('nick').setDescription('Nick').setRequired(true)),
  new SlashCommandBuilder().setName('reportall').setDescription('Barcha reportlar [5+]'),
  new SlashCommandBuilder().setName('topreport').setDescription('Top report [5+]'),
  // Yangilik va Fraksiya
  new SlashCommandBuilder().setName('postnews').setDescription('Yangilik [5+]').addStringOption(o=>o.setName('joy').setDescription('admin/server').setRequired(true)).addStringOption(o=>o.setName('sarlavha').setDescription('Sarlavha').setRequired(true)).addStringOption(o=>o.setName('matn').setDescription('Matn ({emojiID} ishlatsa bo\'ladi)').setRequired(true)).addStringOption(o=>o.setName('rasm').setDescription('Rasm URL').setRequired(false)),
  new SlashCommandBuilder().setName('fraksiya').setDescription('Fraksiya [Lider/5+]').addIntegerOption(o=>o.setName('id').setDescription('ID (1-9)').setRequired(true)),
  new SlashCommandBuilder().setName('setrank').setDescription('Rank [Lider/5+]').addStringOption(o=>o.setName('nick').setDescription('Nick').setRequired(true)).addIntegerOption(o=>o.setName('rank').setDescription('Rank').setRequired(true)),
].map(c=>c.toJSON())

async function registerCmds() {
  const rest = new REST({version:'10'}).setToken(TOKEN)
  try {
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID,GUILD_MAIN),{body:commands})
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID,GUILD_ADMIN),{body:commands})
    console.log('✅ Slash commands ro\'yxatdan o\'tdi!')
  } catch(e) { console.error('Slash xato:', e.message) }
}

// ═══ CLIENT ═══
const client = new Client({
  intents:[GatewayIntentBits.Guilds,GatewayIntentBits.GuildMessages,GatewayIntentBits.MessageContent,GatewayIntentBits.GuildMembers,GatewayIntentBits.DirectMessages,GatewayIntentBits.GuildPresences],
  partials:[Partials.Channel,Partials.Message]
})

client.once('clientReady', async () => {
  console.log(`✅ Bot tayyor: ${client.user.tag}`)
  await registerCmds()
  startTimers()
  for (const gid of [GUILD_MAIN,GUILD_ADMIN]) {
    try {
      const guild = await client.guilds.fetch(gid)
      const members = await guild.members.fetch()
      const role = guild.roles.cache.get(ROLE_MEMBER)
      if (role) for (const [,m] of members) if (!m.roles.cache.has(ROLE_MEMBER)&&!m.user.bot) await m.roles.add(role).catch(()=>{})
    } catch {}
  }
})

client.on('guildMemberAdd', async m => {
  try { const r=m.guild.roles.cache.get(ROLE_MEMBER); if(r) await m.roles.add(r) } catch {}
})

// ═══ DM HANDLER ═══
client.on('messageCreate', async msg => {
  if (msg.author.bot||msg.guild) return

  // SETDC verify
  if (pendingVerify.has(msg.author.id)) {
    const pv = pendingVerify.get(msg.author.id)
    if (Date.now()-pv.time>5*60*1000) { pendingVerify.delete(msg.author.id); await msg.reply(`${E.reject} Vaqt tugadi! Qaytadan /setdc yozing.`); return }
    try {
      const p = await getPlayer(pv.nick)
      if (!p) { await msg.reply(`${E.notfound} Oyinchi topilmadi!`); pendingVerify.delete(msg.author.id); return }
      const ok = await checkPassword(msg.content.trim(), p.password, p.salt)
      if (!ok) { await msg.reply(`${E.reject} Parol noto'g'ri!\n\n💡 O'yindagi parolingizni kiriting.\nQaytadan /setdc yozing.`); pendingVerify.delete(msg.author.id); return }
      if (sitePool) await sitePool.query('INSERT INTO admin_dc_users(player_name,dc_user_id,dc_username,is_verified) VALUES(?,?,?,1) ON DUPLICATE KEY UPDATE dc_user_id=?,dc_username=?,is_verified=1',
        [p.name,msg.author.id,msg.author.username,msg.author.id,msg.author.username])
      const adm = parseInt(p.admin)||0
      await msg.reply(`${E.ok} **${p.name}** akkauntingiz bog'landi!\n${adm>0?`\n${E.admin} Siz **${adminLvl[adm]||'Admin'}** darajasida ekansiz.\n/start yozing!`:''}`)
      pendingVerify.delete(msg.author.id)
    } catch(e) { await msg.reply(`${E.reject} Xato: ${e.message}`); pendingVerify.delete(msg.author.id) }
    return
  }

  // REGISTER
  if (pendingRegister.has(msg.author.id)) {
    const pr = pendingRegister.get(msg.author.id)
    if (Date.now()-pr.time>5*60*1000) { pendingRegister.delete(msg.author.id); await msg.reply(`${E.reject} Vaqt tugadi!`); return }
    if (pr.step==='password') {
      if (msg.content.trim().length<6) { await msg.reply(`${E.reject} Parol kamida 6 belgi!`); return }
      pr.password=msg.content.trim(); pr.step='confirm'; pendingRegister.set(msg.author.id,pr)
      await msg.reply('🔐 Parolni tasdiqlang (qayta yozing):'); return
    }
    if (pr.step==='confirm') {
      if (msg.content.trim()!==pr.password) { pr.step='password'; pendingRegister.set(msg.author.id,pr); await msg.reply(`${E.reject} Parollar mos kelmadi! Yangi parol yozing:`); return }
      try {
        const salt=crypto.randomBytes(16).toString('hex')
        const hash=crypto.createHash('sha256').update(pr.password+salt).digest('hex').toUpperCase()
        await gamePool.query('INSERT INTO accounts(name,password,salt,email,reg_time,last_login,level,money,score) VALUES(?,?,?,?,UNIX_TIMESTAMP(),UNIX_TIMESTAMP(),1,0,0)',[pr.nick,hash,salt,pr.gmail])
        if (sitePool) await sitePool.query('INSERT INTO admin_dc_users(player_name,dc_user_id,dc_username,is_verified) VALUES(?,?,?,1) ON DUPLICATE KEY UPDATE dc_user_id=?,dc_username=?,is_verified=1',
          [pr.nick,msg.author.id,msg.author.username,msg.author.id,msg.author.username])
        await msg.reply(`${E.ok} **${pr.nick}** akkaunt yaratildi!\n\n📧 Gmail: ${pr.gmail}\n🔐 Parol: *siz bilasiz*\n🎮 O'yinga kiring!`)
        pendingRegister.delete(msg.author.id)
      } catch(e) {
        await msg.reply(e.code==='ER_DUP_ENTRY'?`${E.reject} Bu nick allaqachon mavjud!`:`${E.reject} Xato: ${e.message}`)
        pendingRegister.delete(msg.author.id)
      }
    }
  }
})

// ═══ SLASH HANDLER ═══
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return
  const pub = ['start','help','myid','profil','mypul','server','online','top','toplevel','topmoney','topscore','tophours','setdc','register','transfer']
  await interaction.deferReply({ephemeral:pub.includes(interaction.commandName)}).catch(()=>{})

  const cmd = interaction.commandName
  const dcUser = await getDcUser(interaction.user.id)
  const playerInfo = dcUser ? await getPlayer(dcUser.player_name) : null
  const aLvl = playerInfo ? (parseInt(playerInfo.admin)||0) : 0
  const isAdmin = aLvl>=1
  const isOwner = playerInfo?.name===OWNER_NICK || aLvl>=13

  const g = n => interaction.options.getString(n)
  const gi = n => interaction.options.getInteger(n)
  const reply = c => interaction.editReply({content:String(c)}).catch(()=>{})
  const replyE = e => interaction.editReply({embeds:[e]}).catch(()=>{})

  // ── MYID ──
  if (cmd==='myid') { await reply(`${E.id} Discord ID: \`${interaction.user.id}\``); return }

  // ── SETDC ──
  if (cmd==='setdc') {
    const nick=g('nick')
    if (!/^[A-Za-z]+_[A-Za-z]+$/.test(nick)) { await reply(`${E.reject} Format: Ism_Familiya`); return }
    const p=await getPlayer(nick); if (!p) { await reply(`${E.notfound} **${nick}** topilmadi!`); return }
    pendingVerify.set(interaction.user.id,{nick:p.name,time:Date.now()})
    try {
      await interaction.user.send(`${E.id} **${p.name}** akkauntini bog'lash.\n\nO'yindagi parolingizni yozing:`)
      await reply(`${E.ok} DM ga parol so'rovi yuborildi!`)
    } catch { await reply(`${E.reject} DM yuborib bo'lmadi! Discord DM sozlamalarini yoqing.`); pendingVerify.delete(interaction.user.id) }
    setTimeout(()=>pendingVerify.delete(interaction.user.id),5*60*1000)
    return
  }

  // ── REGISTER ──
  if (cmd==='register') {
    const nick=g('nick'), gmail=g('gmail')
    if (!/^[A-Za-z]+_[A-Za-z]+$/.test(nick)) { await reply(`${E.reject} Nick: Ism_Familiya formatida`); return }
    if (!gmail?.includes('@gmail.com')) { await reply(`${E.reject} To'g'ri Gmail kiriting! (example@gmail.com)`); return }
    if (await getPlayer(nick)) { await reply(`${E.reject} **${nick}** allaqachon mavjud!`); return }
    pendingRegister.set(interaction.user.id,{nick,gmail,step:'password',time:Date.now()})
    try {
      await interaction.user.send(`${E.register} **${nick}** akkaunt yaratish\nGmail: ${gmail}\n\nParol o'rnating (kamida 6 belgi):`)
      await reply(`${E.ok} DM ga yuborildi!`)
    } catch { await reply(`${E.reject} DM yuborib bo'lmadi!`); pendingRegister.delete(interaction.user.id) }
    return
  }

  // ── START/HELP ──
  if (cmd==='start'||cmd==='help') {
    const embed=new EmbedBuilder().setColor('#7C3AED')
    if (isAdmin) {
      embed.setTitle(`${E.admin} Admin Buyruqlari`)
        .setDescription(`Salom **${playerInfo.name}** — ${adminLvl[aLvl]||'Admin'}`)
        .addFields(
          {name:`${E.profil} Umumiy`,value:'`/profil` `/online` `/top` `/server` `/mypul` `/transfer`'},
          {name:`${E.ban} Jazo [1+]`,value:'`/ban` `/unban` `/mute` `/unmute`\n`/warn` `/unwarn` `/kick` `/jail` `/unjail`'},
          {name:`${E.jail} Offline [1+]`,value:'`/offban <nick> <kun> <sabab>`\n`/offmute` `/offwarn` `/offjail` `/offunjail`'},
          {name:`${E.ok} Sog\'liq [1+]`,value:'`/hp <nick> <miqdor>` `/heal <nick>`'},
          {name:`${E.active} Aktivlik`,value:'`/myactive [today/week]`\n`/active <nick>` `/activeall` `/topactive`\n`/report <nick>` `/reportall` `/topreport`'},
          {name:`${E.mgive} Moliya [5+]`,value:'`/pul` `/olpul` `/setlevel` `/sendall`'},
          {name:`${E.news} Yangilik [5+]`,value:'`/postnews <admin/server> <sarlavha> <matn> [rasm]`'},
          {name:`${E.admin} Owner`,value:'`/makeadmin <nick> <daraja>` `/unadmin <nick>`'},
          {name:`${E.fraksiya} Fraksiya`,value:'`/fraksiya <id>` `/setrank <nick> <rank>`'},
          {name:`${E.top1} Top`,value:'`/toplevel` `/topmoney` `/topscore` `/tophours` `/topactive` `/topreport`'},
        )
    } else {
      embed.setTitle(`${E.server} Shadows RP Buyruqlari`)
        .addFields(
          {name:`${E.profil} Profil`,value:'`/profil` `/online` `/top` `/server`'},
          {name:`${E.transfer} Moliya`,value:'`/mypul` `/transfer <nick> <miqdor>`'},
          {name:`${E.register} Akkaunt`,value:'`/setdc <nick>` — Bog\'lash\n`/register <nick> <gmail>` — Yangi\n`/myid` — ID'},
        )
    }
    await replyE(embed); return
  }

  // ── PROFIL ──
  if (cmd==='profil') {
    if (!dcUser) { await reply(`${E.reject} Avval /setdc bilan bog'lang!`); return }
    const p=playerInfo; if (!p) return
    const embed=new EmbedBuilder().setColor(p.online==1?0x10B981:0x6B6B8A)
      .setTitle(`${E.profil} ${p.name}`)
      .setDescription(`${teamNames[p.team]||'Fuqaro'} • Daraja ${p.level}`)
      .addFields(
        {name:`${E.mgive} Naqd`,value:`$${fmt(p.money)}`,inline:true},
        {name:'🏦 Bank',value:`$${fmt(p.bank)}`,inline:true},
        {name:'⭐ Score',value:`${p.score||0}`,inline:true},
        {name:'⏱️ Vaqt',value:`${p.totalhour||0}s`,inline:true},
        {name:`${E.admin} Admin`,value:adminLvl[parseInt(p.admin)]||"O'yinchi",inline:true},
        {name:`${E.warn} Warn`,value:`${p.warn||0}/3`,inline:true},
        {name:'🌐 Holat',value:p.online==1?`${E.online} Onlayn`:'⚫ Oflayn',inline:true},
        {name:'🏥 HP',value:`${p.health||100}/100`,inline:true},
        {name:'💎 Premium',value:p.premium==1?`${E.ok}`:`${E.reject}`,inline:true},
      )
    // Site DB dan qo'shimcha ma'lumot
    if (sitePool) {
      const [act]=await sitePool.query('SELECT SUM(online_minutes) as mins,SUM(punishments_given) as puns FROM admin_activity WHERE player_name=? AND date>=DATE_SUB(CURDATE(),INTERVAL 7 DAY)',[p.name]).catch(()=>[[{}]])
      if (act[0]?.mins) embed.addFields({name:`${E.active} Haftalik`,value:`⏱️${act[0].mins||0}d | ⚖️${act[0].puns||0} jazo`,inline:true})
    }
    await replyE(embed); return
  }

  // ── ONLINE ──
  if (cmd==='online') {
    const [players]=await gamePool.query('SELECT name,level,team,id FROM accounts WHERE online=1 ORDER BY level DESC LIMIT 30').catch(()=>[[]])
    await replyE(new EmbedBuilder().setColor('#10B981')
      .setTitle(`${E.online} Onlayn Oyinchilar (${players.length})`)
      .setDescription(players.length?players.map(p=>`${E.online} **${p.name}** (${p.id}) ${p.level}lvl — ${teamNames[p.team]||'Fuqaro'}`).join('\n').slice(0,2000):'Hech kim onlayn emas'))
    return
  }

  // ── TOP ──
  const topCol={top:g('tur')||'level',toplevel:'level',topmoney:'money',topscore:'score',tophours:'totalhour'}
  if (topCol[cmd]!==undefined) {
    const col=topCol[cmd]==='hours'?'totalhour':topCol[cmd]
    const label={level:'Daraja',money:'Boylik',score:'Score',totalhour:'Vaqt'}
    const [pl]=await gamePool.query(`SELECT name,level,money,score,totalhour,online,id FROM accounts ORDER BY ${col} DESC LIMIT 10`).catch(()=>[[]])
    const desc=pl.map((p,i)=>{
      const val=col==='money'?`$${fmt(p.money)}`:col==='totalhour'?`${p.totalhour||0}s`:col==='score'?`${p.score||0}pt`:`${p.level}lvl`
      return `${medal(i)} **${p.name}** (${p.id}) — ${val} ${p.online==1?E.online:''}`
    }).join('\n')
    await replyE(new EmbedBuilder().setColor('#F59E0B').setTitle(`${E.top1} Top 10 — ${label[col]||col}`).setDescription(desc||"Yo'q"))
    return
  }

  // ── SERVER ──
  if (cmd==='server') {
    const [[{total}]]=await gamePool.query('SELECT COUNT(*) as total FROM accounts').catch(()=>[[{total:0}]])
    const [[{online}]]=await gamePool.query('SELECT COUNT(*) as online FROM accounts WHERE online=1').catch(()=>[[{online:0}]])
    const [[{admins}]]=await gamePool.query('SELECT COUNT(*) as admins FROM accounts WHERE admin>0').catch(()=>[[{admins:0}]])
    await replyE(new EmbedBuilder().setColor('#7C3AED').setTitle(`${E.server} Shadows RP`)
      .addFields(
        {name:'🌐 IP',value:'play.shadowsrp.uz',inline:true},
        {name:`${E.online} Onlayn`,value:`${online}`,inline:true},
        {name:'👥 Jami',value:`${total}`,inline:true},
        {name:`${E.admin} Adminlar`,value:`${admins}`,inline:true},
      ))
    return
  }

  // ── MYPUL ──
  if (cmd==='mypul') {
    if (!dcUser) { await reply(`${E.reject} /setdc bilan bog'lang!`); return }
    await reply(`${E.mgive} **${playerInfo.name}**\nNaqd: **$${fmt(playerInfo.money)}**\nBank: **$${fmt(playerInfo.bank)}**`)
    return
  }

  // ── TRANSFER ──
  if (cmd==='transfer') {
    if (!dcUser) { await reply(`${E.reject} /setdc bilan bog'lang!`); return }
    const toNick=g('nick'), amount=gi('miqdor')
    const from=playerInfo, to=await getPlayer(toNick)
    if (!to) { await reply(`${E.notfound} **${toNick}** topilmadi!`); return }
    if (from.money<amount) { await reply(`${E.reject} Yetarli pul yo'q! Sizda: $${fmt(from.money)}`); return }
    if (amount>10000000) { await reply(`${E.reject} Maksimal: $10,000,000`); return }
    if (from.name===to.name) { await reply(`${E.reject} O'zingizga o'tkaza olmaysiz!`); return }
    await gamePool.query('UPDATE accounts SET money=money-? WHERE name=?',[amount,from.name])
    await gamePool.query('UPDATE accounts SET money=money+? WHERE name=?',[amount,to.name])
    await reply(`${E.transfer} **$${fmt(amount)}** **${from.name}** → **${to.name}**`)
    return
  }

  // ════ ADMIN ONLY ════
  if (!isAdmin) { await reply(`${E.reject} Bu buyruq faqat adminlar uchun!`); return }

  // ── MAKEADMIN [Owner] ──
  if (cmd==='makeadmin') {
    if (!isOwner) { await reply(`${E.reject} Faqat Owner!`); return }
    const nick=g('nick'), daraja=gi('daraja')
    const target=await getPlayer(nick); if (!target) { await reply(`${E.notfound} **${nick}** topilmadi!`); return }
    const lvl=Math.min(Math.max(daraja,1),6)
    await gamePool.query('UPDATE accounts SET admin=? WHERE name=?',[lvl,target.name])
    if (sitePool) await sitePool.query('INSERT INTO admin_logs(admin_name,action,details) VALUES(?,?,?)',[playerInfo.name,'makeadmin',`${nick} → Admin ${lvl}`]).catch(()=>{})
    await reply(`${E.ok} **${target.name}** Admin **${lvl}** (${adminLvl[lvl]}) darajasiga ko'tarildi!`)
    return
  }

  // ── UNADMIN [Owner] ──
  if (cmd==='unadmin') {
    if (!isOwner) { await reply(`${E.reject} Faqat Owner!`); return }
    const nick=g('nick')
    const target=await getPlayer(nick); if (!target) { await reply(`${E.notfound} **${nick}** topilmadi!`); return }
    await gamePool.query('UPDATE accounts SET admin=0 WHERE name=?',[target.name])
    if (sitePool) await sitePool.query('INSERT INTO admin_logs(admin_name,action,details) VALUES(?,?,?)',[playerInfo.name,'unadmin',`${nick} → 0`]).catch(()=>{})
    await reply(`${E.ok} **${target.name}** adminlikdan olindi!`)
    return
  }

  // ── ADMINS [5+] ──
  if (cmd==='admins') {
    if (aLvl<5) { await reply(`${E.warn} Min Admin 5!`); return }
    const [admins]=await gamePool.query('SELECT name,admin,online,totalhour,id FROM accounts WHERE admin>0 ORDER BY admin DESC LIMIT 20').catch(()=>[[]])
    let desc=''
    for (const a of admins) {
      let mention=''
      if (sitePool) { const [dc]=await sitePool.query('SELECT dc_user_id FROM admin_dc_users WHERE player_name=? AND is_verified=1',[a.name]).catch(()=>[[]]); if(dc[0]?.dc_user_id) mention=`<@${dc[0].dc_user_id}>` }
      desc+=`${a.online==1?E.online:'⚫'} **${a.name}** (${a.id}) — ${adminLvl[a.admin]||'Admin'} ${mention}\n`
    }
    await replyE(new EmbedBuilder().setColor('#9D4EDD').setTitle(`${E.admin} Adminlar`).setDescription(desc||"Yo'q"))
    return
  }

  // ── BANLIST ──
  if (cmd==='banlist') {
    const [bans]=await gamePool.query('SELECT player,admin,reason FROM ban_list ORDER BY id DESC LIMIT 15').catch(()=>[[]])
    await replyE(new EmbedBuilder().setColor('#EF4444').setTitle(`${E.ban} Ban Ro'yxati`)
      .setDescription(bans.length?bans.map((b,i)=>`**${i+1}.** ${b.player} — ${b.reason||'?'} (${b.admin})`).join('\n'):"Yo'q"))
    return
  }

  // ── AKTIVLIK BUYRUQLAR ──
  const actReply = async (name, davr) => {
    if (!sitePool) return reply(`${E.reject} DB ulangmagan`)
    let d={}, title=name+' — '
    if (davr==='week') {
      const [r]=await sitePool.query('SELECT SUM(online_minutes) as mins,SUM(reports_checked) as rep,SUM(complaints_closed) as com,SUM(punishments_given) as pun FROM admin_activity WHERE player_name=? AND date>=DATE_SUB(CURDATE(),INTERVAL 7 DAY)',[name]).catch(()=>[[{}]])
      d={mins:r[0]?.mins||0,rep:r[0]?.rep||0,com:r[0]?.com||0,pun:r[0]?.pun||0}; title+='Haftalik'
    } else {
      const [r]=await sitePool.query('SELECT * FROM admin_activity WHERE player_name=? AND date=?',[name,today()]).catch(()=>[[]])
      const x=r[0]||{}; d={mins:x.online_minutes||0,rep:x.reports_checked||0,com:x.complaints_closed||0,pun:x.punishments_given||0}; title+='Bugun'
    }
    await replyE(new EmbedBuilder().setColor('#7C3AED').setTitle(`${E.active} ${title}`)
      .addFields({name:'⏱️ Online',value:`${d.mins} daqiqa`,inline:true},{name:'📋 Report',value:`${d.rep}`,inline:true},{name:'📝 Shikoyat',value:`${d.com}`,inline:true},{name:'⚖️ Jazo',value:`${d.pun}`,inline:true})
      .setFooter({text:today()}))
  }

  if (cmd==='myactive') { await actReply(playerInfo.name, g('davr')||'today'); return }

  if (cmd==='active') {
    if (aLvl<5) { await reply(`${E.warn} Min Admin 5!`); return }
    const nick=g('nick'), p=await getPlayer(nick)
    if (!p) { await reply(`${E.notfound} **${nick}** topilmadi!`); return }
    await actReply(p.name, g('davr')||'today'); return
  }

  if (cmd==='activeall') {
    if (aLvl<5) { await reply(`${E.warn} Min Admin 5!`); return }
    if (!sitePool) { await reply(`${E.reject} DB ulangmagan`); return }
    const davr=g('davr')||'today'
    const where=davr==='week'?'AND date>=DATE_SUB(CURDATE(),INTERVAL 7 DAY)':'AND date=CURDATE()'
    const [allA]=await gamePool.query('SELECT name,admin,online FROM accounts WHERE admin>0 ORDER BY admin DESC').catch(()=>[[]])
    const [rows]=await sitePool.query(`SELECT player_name,SUM(online_minutes) as mins,SUM(reports_checked) as rep,SUM(punishments_given) as pun FROM admin_activity WHERE 1=1 ${where} GROUP BY player_name`).catch(()=>[[]])
    const map={}; rows.forEach(r=>map[r.player_name]=r)
    const desc=allA.map((a,i)=>{const d=map[a.name]||{}; return `**${i+1}.** ${a.online==1?E.online:'⚫'} **${a.name}** | ⏱️${d.mins||0}d | 📋${d.rep||0} | ⚖️${d.pun||0}`}).join('\n')
    await replyE(new EmbedBuilder().setColor('#7C3AED').setTitle(`${E.active} Barcha Adminlar — ${davr==='week'?'Haftalik':'Bugun'}`).setDescription(desc.slice(0,2000)||"Yo'q"))
    return
  }

  if (cmd==='topactive') {
    if (aLvl<5) { await reply(`${E.warn} Min Admin 5!`); return }
    if (!sitePool) { await reply(`${E.reject} DB ulangmagan`); return }
    const [rows]=await sitePool.query('SELECT player_name,SUM(online_minutes) as mins FROM admin_activity WHERE date>=DATE_SUB(CURDATE(),INTERVAL 7 DAY) GROUP BY player_name ORDER BY mins DESC LIMIT 10').catch(()=>[[]])
    await replyE(new EmbedBuilder().setColor('#F59E0B').setTitle(`${E.top1} Top Aktiv Adminlar (Haftalik)`)
      .setDescription(rows.length?rows.map((r,i)=>`${medal(i)} **${r.player_name}** — ${r.mins||0} daqiqa`).join('\n'):"Yo'q"))
    return
  }

  if (cmd==='report') {
    if (aLvl<5) { await reply(`${E.warn} Min Admin 5!`); return }
    if (!sitePool) { await reply(`${E.reject} DB ulangmagan`); return }
    const nick=g('nick')
    const [td]=await sitePool.query('SELECT reports_checked FROM admin_activity WHERE player_name=? AND date=?',[nick,today()]).catch(()=>[[]])
    const [wk]=await sitePool.query('SELECT SUM(reports_checked) as t FROM admin_activity WHERE player_name=? AND date>=DATE_SUB(CURDATE(),INTERVAL 7 DAY)',[nick]).catch(()=>[[{}]])
    await replyE(new EmbedBuilder().setColor('#3B82F6').setTitle(`📋 ${nick} — Reportlar`)
      .addFields({name:'Bugun',value:`${td[0]?.reports_checked||0}`,inline:true},{name:'Haftalik',value:`${wk[0]?.t||0}`,inline:true}))
    return
  }

  if (cmd==='reportall') {
    if (aLvl<5) { await reply(`${E.warn} Min Admin 5!`); return }
    if (!sitePool) { await reply(`${E.reject} DB ulangmagan`); return }
    const [allA]=await gamePool.query('SELECT name FROM accounts WHERE admin>0').catch(()=>[[]])
    const [rows]=await sitePool.query('SELECT player_name,SUM(reports_checked) as t FROM admin_activity WHERE date>=DATE_SUB(CURDATE(),INTERVAL 7 DAY) GROUP BY player_name ORDER BY t DESC').catch(()=>[[]])
    const map={}; rows.forEach(r=>map[r.player_name]=r.t||0)
    await replyE(new EmbedBuilder().setColor('#3B82F6').setTitle('📋 Barcha Adminlar Reportlari (Haftalik)')
      .setDescription(allA.map((a,i)=>`**${i+1}.** **${a.name}** — ${map[a.name]||0} report`).join('\n').slice(0,2000)||"Yo'q"))
    return
  }

  if (cmd==='topreport') {
    if (aLvl<5) { await reply(`${E.warn} Min Admin 5!`); return }
    if (!sitePool) { await reply(`${E.reject} DB ulangmagan`); return }
    const [rows]=await sitePool.query('SELECT player_name,SUM(reports_checked) as t FROM admin_activity WHERE date>=DATE_SUB(CURDATE(),INTERVAL 7 DAY) GROUP BY player_name ORDER BY t DESC LIMIT 10').catch(()=>[[]])
    await replyE(new EmbedBuilder().setColor('#F59E0B').setTitle(`${E.top1} Top Report (Haftalik)`)
      .setDescription(rows.length?rows.map((r,i)=>`${medal(i)} **${r.player_name}** — ${r.t||0} report`).join('\n'):"Yo'q"))
    return
  }

  // ── POSTNEWS [5+] ──
  if (cmd==='postnews') {
    if (aLvl<5) { await reply(`${E.warn} Min Admin 5!`); return }
    const joy=g('joy'), sarlavha=g('sarlavha'), matn=g('matn'), rasm=g('rasm')
    const ch=await client.channels.fetch(joy==='server'?CH_SERVER_NEWS:CH_ADMIN_NEWS).catch(()=>null)
    if (!ch) { await reply(`${E.reject} Kanal topilmadi!`); return }
    const embed=new EmbedBuilder().setColor('#7C3AED').setTitle(`${E.news} ${sarlavha}`).setDescription(parseEmoji(matn)).setTimestamp().setFooter({text:`Shadows RP | ${playerInfo.name}`})
    if (rasm) embed.setImage(rasm)
    await ch.send({embeds:[embed]})
    await reply(`${E.ok} Yangilik **${joy==='server'?'Server':'Admin'}** kanaliga yuborildi!`)
    return
  }

  // ── SENDALL [5+] ──
  if (cmd==='sendall') {
    if (aLvl<5) { await reply(`${E.warn} Min Admin 5!`); return }
    await sendGameCmd(`ann:${playerInfo.name}:${g('matn')}`)
    await reply(`${E.ok} Xabar barcha oyinchilarga yuborildi!`)
    return
  }

  // ── FRAKSIYA ──
  if (cmd==='fraksiya') {
    const teamId=gi('id')
    if (aLvl<5) {
      const [my]=await gamePool.query('SELECT subdivison,team FROM accounts WHERE name=?',[playerInfo.name]).catch(()=>[[]])
      if (!my[0]||my[0].team!==teamId||(my[0].subdivison||0)<5) { await reply(`${E.warn} Faqat lider yoki Admin 5+!`); return }
    }
    const [mem]=await gamePool.query('SELECT name,level,online,totalhour,subdivison,id FROM accounts WHERE team=? ORDER BY subdivison DESC,level DESC',[teamId]).catch(()=>[[]])
    const tN={1:'Politsiya',2:'Tibbiyot',3:'Armiya',4:'SWAT',5:'FIB',6:'Sheriff',7:"Yong'inchi",8:'Mehnat',9:"Yo'l xizmati"}
    const desc=mem.map(m=>`${m.online==1?E.online:'⚫'} **${m.name}** (${m.id}) | ${m.level}lvl | Rank ${m.subdivison||0}`).join('\n')
    await replyE(new EmbedBuilder().setColor('#7C3AED').setTitle(`${E.fraksiya} ${tN[teamId]||'Fraksiya'} (${mem.length} a'zo)`).setDescription(desc.slice(0,2000)||"A'zo yo'q"))
    return
  }

  // ── SETRANK ──
  if (cmd==='setrank') {
    const nick=g('nick'), rank=gi('rank')
    if (aLvl<5) {
      const [my]=await gamePool.query('SELECT subdivison,team FROM accounts WHERE name=?',[playerInfo.name]).catch(()=>[[]])
      const [tg]=await gamePool.query('SELECT team FROM accounts WHERE name=?',[nick]).catch(()=>[[]])
      if (!my[0]||!tg[0]||my[0].team!==tg[0].team||(my[0].subdivison||0)<5) { await reply(`${E.warn} Faqat lider yoki Admin 5+!`); return }
    }
    await gamePool.query('UPDATE accounts SET subdivison=? WHERE name=?',[rank,nick])
    await reply(`${E.ok} **${nick}** rank **${rank}** ga o'rnatildi!`)
    return
  }

  // ── HP ──
  if (cmd==='hp') {
    const nick=g('nick'), miqdor=gi('miqdor')
    const t=await getPlayer(nick); if (!t) { await reply(`${E.notfound} **${nick}** topilmadi!`); return }
    await gamePool.query('UPDATE accounts SET health=? WHERE name=?',[Math.min(miqdor,100),t.name])
    await sendGameCmd(`hp:${t.name}:${Math.min(miqdor,100)}:`)
    await reply(`${E.ok} **${t.name}** HP **${Math.min(miqdor,100)}**!`)
    return
  }

  // ── HEAL ──
  if (cmd==='heal') {
    const t=await getPlayer(g('nick')); if (!t) { await reply(`${E.notfound} Topilmadi!`); return }
    await gamePool.query('UPDATE accounts SET health=100 WHERE name=?',[t.name])
    await sendGameCmd(`hp:${t.name}:100:`)
    await reply(`${E.ok} **${t.name}** to'liq davolandi!`)
    return
  }

  // ── PUL [5+] ──
  if (cmd==='pul') {
    if (aLvl<5) { await reply(`${E.warn} Min Admin 5!`); return }
    const t=await getPlayer(g('nick')), m=gi('miqdor')
    if (!t) { await reply(`${E.notfound} Topilmadi!`); return }
    await gamePool.query('UPDATE accounts SET money=money+? WHERE name=?',[m,t.name])
    await sendGameCmd(`pul:${t.name}:${m}:`)
    if (sitePool) await sitePool.query('INSERT INTO admin_logs(admin_name,action,details) VALUES(?,?,?)',[playerInfo.name,'Pul berish',`${t.name} $${fmt(m)}`]).catch(()=>{})
    await reply(`${E.mgive} **${t.name}** ga **$${fmt(m)}** berildi!`)
    return
  }

  // ── OLPUL [5+] ──
  if (cmd==='olpul') {
    if (aLvl<5) { await reply(`${E.warn} Min Admin 5!`); return }
    const t=await getPlayer(g('nick')), m=gi('miqdor')
    if (!t) { await reply(`${E.notfound} Topilmadi!`); return }
    await gamePool.query('UPDATE accounts SET money=GREATEST(0,money-?) WHERE name=?',[m,t.name])
    await sendGameCmd(`olpul:${t.name}:${m}:`)
    if (sitePool) await sitePool.query('INSERT INTO admin_logs(admin_name,action,details) VALUES(?,?,?)',[playerInfo.name,'Pul olish',`${t.name} $${fmt(m)}`]).catch(()=>{})
    await reply(`${E.mtake} **${t.name}** dan **$${fmt(m)}** olindi!`)
    return
  }

  // ── SETLEVEL [5+] ──
  if (cmd==='setlevel') {
    if (aLvl<5) { await reply(`${E.warn} Min Admin 5!`); return }
    const t=await getPlayer(g('nick')), lvl=Math.min(Math.max(gi('daraja'),1),100)
    if (!t) { await reply(`${E.notfound} Topilmadi!`); return }
    await gamePool.query('UPDATE accounts SET level=? WHERE name=?',[lvl,t.name])
    await sendGameCmd(`setlevel:${t.name}:${lvl}:`)
    if (sitePool) await sitePool.query('INSERT INTO admin_logs(admin_name,action,details) VALUES(?,?,?)',[playerInfo.name,'Daraja',`${t.name} → ${lvl}`]).catch(()=>{})
    await reply(`${E.ok} **${t.name}** daraja **${lvl}**!`)
    return
  }

  // ══ JAZO BUYRUQLAR ══
  async function doJazo(type, nick, reason, duration) {
    const t = await getPlayer(nick)||{name:nick,id:'?'}
    if (t.id!=='?') {
      const targetAdm = parseInt(t.admin)||0
      if (['BAN','MUTE','WARN','JAIL','KICK'].includes(type) && targetAdm>=aLvl) {
        await reply(`${E.reject} Bu oyinchiga jazo bera olmaysiz!`); return false
      }
    }
    await doPunish(playerInfo, t, type, reason, duration, client)
    return true
  }

  if (cmd==='ban') {
    const nick=g('nick'),vaqt=g('vaqt'),sabab=g('sabab')
    const t=await getPlayer(nick); if (!t) { await reply(`${E.notfound} **${nick}** topilmadi!`); return }
    if ((parseInt(t.admin)||0)>=aLvl) { await reply(`${E.reject} Bu oyinchiga jazo bera olmaysiz!`); return }
    await gamePool.query("INSERT INTO ban_list(player,admin,reason,date) VALUES(?,?,?,NOW()) ON DUPLICATE KEY UPDATE reason=?,admin=?",[t.name,playerInfo.name,sabab,sabab,playerInfo.name]).catch(()=>{})
    await doPunish(playerInfo,t,'BAN',sabab,vaqt,client)
    await reply(`${E.ban} **${t.name}** (${t.id}) banland!\nVaqt: ${vaqt} | Sabab: ${sabab}`)
    return
  }
  if (cmd==='unban') {
    const t=await getPlayer(g('nick'))||{name:g('nick'),id:'?'}
    await gamePool.query("DELETE FROM ban_list WHERE player=?",[t.name]).catch(()=>{})
    await doPunish(playerInfo,t,'UNBAN','Ban bekor',null,client)
    await reply(`${E.unban} **${t.name}** ban bekor!`)
    return
  }
  if (cmd==='mute') {
    const nick=g('nick'),dq=gi('daqiqa'),sb=g('sabab')
    const t=await getPlayer(nick); if (!t) { await reply(`${E.notfound} **${nick}** topilmadi!`); return }
    if ((parseInt(t.admin)||0)>=aLvl) { await reply(`${E.reject} Bu oyinchiga jazo bera olmaysiz!`); return }
    await gamePool.query('UPDATE accounts SET mute=? WHERE name=?',[dq,t.name])
    await doPunish(playerInfo,t,'MUTE',sb,`${dq} daqiqa`,client)
    await reply(`${E.mute} **${t.name}** (${t.id}) ${dq} daqiqa mute!\nSabab: ${sb}`)
    return
  }
  if (cmd==='unmute') {
    const t=await getPlayer(g('nick'))||{name:g('nick'),id:'?'}
    await gamePool.query('UPDATE accounts SET mute=0 WHERE name=?',[t.name])
    await doPunish(playerInfo,t,'UNMUTE','Mute bekor',null,client)
    await reply(`${E.unmute} **${t.name}** mute bekor!`)
    return
  }
  if (cmd==='warn') {
    const nick=g('nick'),sb=g('sabab')
    const t=await getPlayer(nick); if (!t) { await reply(`${E.notfound} **${nick}** topilmadi!`); return }
    if ((parseInt(t.admin)||0)>=aLvl) { await reply(`${E.reject} Bu oyinchiga jazo bera olmaysiz!`); return }
    const w=(parseInt(t.warn)||0)+1
    await gamePool.query('UPDATE accounts SET warn=? WHERE name=?',[w,t.name])
    await doPunish(playerInfo,t,'WARN',sb,null,client)
    await reply(`${E.warn} **${t.name}** (${t.id}) warn (${w}/3)!\nSabab: ${sb}`)
    return
  }
  if (cmd==='unwarn') {
    const t=await getPlayer(g('nick'))||{name:g('nick'),id:'?'}
    await gamePool.query('UPDATE accounts SET warn=GREATEST(0,warn-1) WHERE name=?',[t.name])
    await doPunish(playerInfo,t,'UNWARN','1 warn olindi',null,client)
    await reply(`${E.ok} **${t.name}** dan warn olindi!`)
    return
  }
  if (cmd==='kick') {
    const nick=g('nick'),sb=g('sabab')
    const t=await getPlayer(nick); if (!t) { await reply(`${E.notfound} **${nick}** topilmadi!`); return }
    await doPunish(playerInfo,t,'KICK',sb,null,client)
    await reply(`${E.kick} **${t.name}** (${t.id}) kicklandi!\nSabab: ${sb}`)
    return
  }
  if (cmd==='jail') {
    const nick=g('nick'),dq=gi('daqiqa'),sb=g('sabab')
    const t=await getPlayer(nick); if (!t) { await reply(`${E.notfound} **${nick}** topilmadi!`); return }
    if ((parseInt(t.admin)||0)>=aLvl) { await reply(`${E.reject} Bu oyinchiga jazo bera olmaysiz!`); return }
    await gamePool.query('UPDATE accounts SET jail=? WHERE name=?',[dq,t.name])
    await doPunish(playerInfo,t,'JAIL',sb,`${dq} daqiqa`,client)
    await reply(`${E.jail} **${t.name}** (${t.id}) ${dq} daqiqa qamoq!\nSabab: ${sb}`)
    return
  }
  if (cmd==='unjail') {
    const t=await getPlayer(g('nick'))||{name:g('nick'),id:'?'}
    await gamePool.query('UPDATE accounts SET jail=0 WHERE name=?',[t.name])
    await doPunish(playerInfo,t,'UNJAIL','Qamoqdan chiqarildi',null,client)
    await reply(`${E.unjail} **${t.name}** qamoqdan chiqdi!`)
    return
  }
  // OFFLINE
  if (cmd==='offban') {
    const nick=g('nick'),kun=g('kun'),sb=g('sabab')
    const t=await getPlayer(nick)||{name:nick,id:'?'}
    await gamePool.query("INSERT INTO ban_list(player,admin,reason,date) VALUES(?,?,?,NOW()) ON DUPLICATE KEY UPDATE reason=?,admin=?",[t.name,playerInfo.name,`[${kun}kun] ${sb}`,`[${kun}kun] ${sb}`,playerInfo.name]).catch(()=>{})
    await doPunish(playerInfo,t,'OFFBAN',`[OFFLINE] ${sb}`,`${kun} kun`,client)
    await reply(`${E.ban} **${t.name}** offline ${kun} kun ban!\nSabab: ${sb}`)
    return
  }
  if (cmd==='offmute') {
    const nick=g('nick'),dq=gi('daqiqa'),sb=g('sabab')
    const t=await getPlayer(nick)||{name:nick,id:'?'}
    await gamePool.query('UPDATE accounts SET mute=? WHERE name=?',[dq,t.name])
    await doPunish(playerInfo,t,'OFFMUTE',`[OFFLINE] ${sb}`,`${dq} daqiqa`,client)
    await reply(`${E.mute} **${t.name}** offline ${dq} daqiqa mute!\nSabab: ${sb}`)
    return
  }
  if (cmd==='offwarn') {
    const nick=g('nick'),sb=g('sabab')
    const t=await getPlayer(nick)||{name:nick,id:'?'}
    await gamePool.query('UPDATE accounts SET warn=warn+1 WHERE name=?',[t.name])
    await doPunish(playerInfo,t,'OFFWARN',`[OFFLINE] ${sb}`,null,client)
    await reply(`${E.warn} **${t.name}** offline warn!\nSabab: ${sb}`)
    return
  }
  if (cmd==='offjail') {
    const nick=g('nick'),dq=gi('daqiqa'),sb=g('sabab')
    const t=await getPlayer(nick)||{name:nick,id:'?'}
    await gamePool.query('UPDATE accounts SET jail=? WHERE name=?',[dq,t.name])
    await doPunish(playerInfo,t,'OFFJAIL',`[OFFLINE] ${sb}`,`${dq} daqiqa`,client)
    await reply(`${E.jail} **${t.name}** offline ${dq} daqiqa qamoq!\nSabab: ${sb}`)
    return
  }
  if (cmd==='offunjail') {
    const t=await getPlayer(g('nick'))||{name:g('nick'),id:'?'}
    await gamePool.query('UPDATE accounts SET jail=0 WHERE name=?',[t.name])
    await doPunish(playerInfo,t,'OFFUNJAIL','[OFFLINE] Qamoqdan chiqarildi',null,client)
    await reply(`${E.unjail} **${t.name}** offline qamoqdan chiqdi!`)
    return
  }
})

async function start() {
  await initDB()
  await client.login(TOKEN).catch(e=>{console.error('Login xatosi:',e.message);process.exit(1)})
}
start()
