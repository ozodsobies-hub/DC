require('dotenv').config()
const { Client, GatewayIntentBits, Partials, EmbedBuilder } = require('discord.js')
const mysql = require('mysql2/promise')
const { GoogleGenerativeAI } = require('@google/generative-ai')

// ═══ CONFIG ═══
const TOKEN = process.env.DISCORD_TOKEN || 'MTUyMDUxNzU1MDM4NjE4NDI0Mw.G9McQC.wrYP6Et-bjfKpwroxbPeXG_oCdMnWz9iwIJ2Ig'
const OWNER_NICK = process.env.OWNER_NICK || 'Nodirbek_Hatred'

const CH_SERVER_NEWS = '1500773549554798602'
const CH_ADMIN_NEWS  = '1500945593407639715'
const CH_GAME_CHAT   = '1501055278827704551'
const CH_PUNISHMENTS = '1501081847046865057'
const GUILD_MAIN     = '1500771666027085836'
const GUILD_ADMIN    = '1500945591281258729'
const ROLE_MEMBER    = '1500772487896629298'
const ROLE_ADMIN     = '1500953705405485158'
const EMOJI_OK       = '1520802211498688702'
const EMOJI_REJECT   = '1520802491783188500'
const EMOJI_WARN     = '1520803081359458364'
const EMOJI_PUNISH   = '1520805096202436738'

// ═══ DB CONFIG ═══
// Railway da MYSQL_URL environment variable avtomatik qo'shiladi
// Agar yo'q bo'lsa, alohida o'zgaruvchilardan foydalanamiz
function getSiteDBConfig() {
  // Railway MYSQL_URL dan parse qilish
  if (process.env.MYSQL_URL) {
    try {
      const url = new URL(process.env.MYSQL_URL)
      return {
        host: url.hostname,
        port: parseInt(url.port) || 3306,
        user: url.username,
        password: url.password,
        database: url.pathname.slice(1),
        waitForConnections: true,
        connectionLimit: 5,
        connectTimeout: 20000,
        ssl: { rejectUnauthorized: false }
      }
    } catch(e) { console.log('MYSQL_URL parse xatosi:', e.message) }
  }

  // MYSQL_PUBLIC_URL dan parse qilish
  if (process.env.MYSQL_PUBLIC_URL) {
    try {
      const url = new URL(process.env.MYSQL_PUBLIC_URL)
      return {
        host: url.hostname,
        port: parseInt(url.port) || 3306,
        user: url.username,
        password: url.password,
        database: url.pathname.slice(1),
        waitForConnections: true,
        connectionLimit: 5,
        connectTimeout: 20000,
        ssl: { rejectUnauthorized: false }
      }
    } catch(e) { console.log('MYSQL_PUBLIC_URL parse xatosi:', e.message) }
  }

  // Manual config
  return {
    host: process.env.SITE_DB_HOST || 'zephyr.proxy.rlwy.net',
    port: parseInt(process.env.SITE_DB_PORT || '35377'),
    user: process.env.SITE_DB_USER || 'root',
    password: process.env.SITE_DB_PASS || '',
    database: process.env.SITE_DB_NAME || 'railway',
    waitForConnections: true,
    connectionLimit: 5,
    connectTimeout: 20000,
    ssl: { rejectUnauthorized: false }
  }
}

const GAME_DB = {
  host: '188.127.241.8', port: 3306,
  user: 'gs137892', password: 'XFpWuN7kssXj',
  database: 'gs137892',
  waitForConnections: true, connectionLimit: 5, connectTimeout: 15000
}

let gamePool, sitePool

async function initDB() {
  // Game DB
  try {
    gamePool = mysql.createPool(GAME_DB)
    await gamePool.query('SELECT 1')
    console.log('✅ Game DB ulandi!')
  } catch(e) { console.error('❌ Game DB:', e.message) }

  // Site DB - bir necha urinish
  const siteConfig = getSiteDBConfig()
  console.log('Site DB ulanish:', siteConfig.host + ':' + siteConfig.port)

  for (let i = 0; i < 3; i++) {
    try {
      sitePool = mysql.createPool(siteConfig)
      await sitePool.query('SELECT 1')
      console.log('✅ Site DB ulandi!')
      await createTables()
      return
    } catch(e) {
      console.error(`❌ Site DB urinish ${i+1}:`, e.message)
      await new Promise(r => setTimeout(r, 3000))
    }
  }
  console.error('❌ Site DB ga ulanib bo\'lmadi! Bot DB siz ishlaydi.')
}

async function createTables() {
  try {
    await sitePool.query(`CREATE TABLE IF NOT EXISTS admin_dc_users (id INT AUTO_INCREMENT PRIMARY KEY, player_name VARCHAR(64) NOT NULL UNIQUE, dc_user_id VARCHAR(64), dc_username VARCHAR(64), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
    await sitePool.query(`CREATE TABLE IF NOT EXISTS admin_activity (id INT AUTO_INCREMENT PRIMARY KEY, player_name VARCHAR(64) NOT NULL, online_minutes INT DEFAULT 0, reports_checked INT DEFAULT 0, complaints_closed INT DEFAULT 0, punishments_given INT DEFAULT 0, date DATE NOT NULL, UNIQUE KEY dp (player_name, date)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
    await sitePool.query(`CREATE TABLE IF NOT EXISTS muted_dc_users (id INT AUTO_INCREMENT PRIMARY KEY, dc_user_id VARCHAR(64) NOT NULL UNIQUE, muted_until DATETIME NOT NULL, reason TEXT) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
    await sitePool.query(`CREATE TABLE IF NOT EXISTS punishment_logs (id INT AUTO_INCREMENT PRIMARY KEY, admin_nick VARCHAR(64), player_nick VARCHAR(64), type VARCHAR(32), reason TEXT, duration VARCHAR(32), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
    console.log('✅ Jadvallar tayyor!')
  } catch(e) { console.error('Jadval xatosi:', e.message) }
}

// ═══ HELPERS ═══
const fmt = v => Number(v||0).toLocaleString('ru-RU')
const teamNames = {0:'Fuqaro',1:'Politsiya',2:'Tibbiyot',3:'Armiya',4:'SWAT',5:'FIB',6:'Sheriff',7:"Yong'inchi",8:'Mehnat',9:"Yo'l xizmati"}
const adminLvl = {0:"O'yinchi",1:'Yangi Admin',2:'Admin',3:'Senior Admin',4:'Bosh Admin',5:'Co-Owner',6:'Super Admin',13:'Owner'}
const today = () => new Date().toISOString().split('T')[0]

async function getPlayer(name) {
  try { const [r] = await gamePool.query('SELECT * FROM accounts WHERE name=?', [name]); return r[0]||null } catch { return null }
}

async function getDcUser(dcId) {
  try { if (!sitePool) return null; const [r] = await sitePool.query('SELECT * FROM admin_dc_users WHERE dc_user_id=?', [dcId]); return r[0]||null } catch { return null }
}

async function getGeminiKeys() {
  try {
    if (!sitePool) return []
    const [r] = await sitePool.query("SELECT setting_key,setting_value FROM settings WHERE setting_key IN ('gemini_key1','gemini_key2','gemini_key3')")
    const k = {}; r.forEach(x => k[x.setting_key] = x.setting_value)
    return [k.gemini_key1, k.gemini_key2, k.gemini_key3].filter(Boolean)
  } catch { return [] }
}

async function checkToxic(text) {
  const keys = await getGeminiKeys()
  if (!keys.length) return false
  for (const key of keys) {
    try {
      const ai = new GoogleGenerativeAI(key)
      const model = ai.getGenerativeModel({ model: 'gemini-2.0-flash' })
      const res = await model.generateContent(`Quyidagi matnda so'kinish, haqorat bormi? Faqat "true" yoki "false":\n"${text}"`)
      return res.response.text().trim().toLowerCase().includes('true')
    } catch { continue }
  }
  return false
}

async function logPunishment(adminNick, playerNick, type, reason, duration, client) {
  try {
    const ch = await client.channels.fetch(CH_PUNISHMENTS).catch(() => null)
    if (!ch) return
    let adminMention = `**${adminNick}**`
    if (sitePool) {
      const [dc] = await sitePool.query('SELECT dc_user_id FROM admin_dc_users WHERE player_name=?', [adminNick]).catch(() => [[]])
      if (dc[0]?.dc_user_id) adminMention = `<@${dc[0].dc_user_id}>`
    }
    const emoji = {BAN:'⛔',KICK:'👢',MUTE:'🔇',WARN:'⚠️',JAIL:'🔒',UNBAN:'✅',UNMUTE:'🔊',UNWARN:'✅',UNJAIL:'🔓'}
    const color = {BAN:0xEF4444,KICK:0xF59E0B,MUTE:0x9D4EDD,WARN:0xF59E0B,JAIL:0xEF4444}
    const embed = new EmbedBuilder()
      .setColor(color[type]||0x9D4EDD)
      .setTitle(`${emoji[type]||'⚖️'} ${type} — ${playerNick}`)
      .addFields(
        {name:'👮 Admin', value:adminMention, inline:true},
        {name:'🎯 Oyinchi', value:`**${playerNick}**`, inline:true},
        {name:'📋 Sabab', value:reason||"Ko'rsatilmagan", inline:false},
        ...(duration?[{name:'⏱️ Vaqt',value:duration,inline:true}]:[])
      ).setTimestamp()
    await ch.send({embeds:[embed]})
    if (sitePool) {
      await sitePool.query('INSERT INTO punishment_logs(admin_nick,player_nick,type,reason,duration) VALUES(?,?,?,?,?)',[adminNick,playerNick,type,reason,duration||null]).catch(()=>{})
      await sitePool.query('INSERT INTO admin_activity(player_name,date,punishments_given) VALUES(?,?,1) ON DUPLICATE KEY UPDATE punishments_given=punishments_given+1',[adminNick,today()]).catch(()=>{})
    }
  } catch(e) { console.error('Log xato:', e.message) }
}

// ═══ CLIENT ═══
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildPresences,
  ],
  partials: [Partials.Channel, Partials.Message]
})

client.once('ready', async () => {
  console.log(`✅ Bot tayyor: ${client.user.tag}`)
  for (const gid of [GUILD_MAIN, GUILD_ADMIN]) {
    try {
      const guild = await client.guilds.fetch(gid)
      const members = await guild.members.fetch()
      const role = guild.roles.cache.get(ROLE_MEMBER)
      if (role) for (const [,m] of members) {
        if (!m.roles.cache.has(ROLE_MEMBER) && !m.user.bot) await m.roles.add(role).catch(()=>{})
      }
    } catch {}
  }
})

client.on('guildMemberAdd', async member => {
  try { const role = member.guild.roles.cache.get(ROLE_MEMBER); if (role) await member.roles.add(role) } catch {}
})

client.on('messageCreate', async message => {
  if (message.author.bot) return
  const content = message.content.trim()
  const channelId = message.channel.id

  // Toxicity check
  if (channelId === CH_SERVER_NEWS && content.length > 3 && !content.startsWith('/')) {
    try {
      if (sitePool) {
        const [muted] = await sitePool.query('SELECT * FROM muted_dc_users WHERE dc_user_id=? AND muted_until>NOW()',[message.author.id]).catch(()=>[[]])
        if (muted.length > 0) {
          await message.delete().catch(()=>{})
          await message.author.send(`❌ Siz ${new Date(muted[0].muted_until).toLocaleString('uz-UZ')} gacha mutesiz!`).catch(()=>{})
          return
        }
      }
      const toxic = await checkToxic(content)
      if (toxic && sitePool) {
        const mins = [30,60,120,480,1440][Math.floor(Math.random()*3)]
        const until = new Date(Date.now()+mins*60000)
        await sitePool.query('INSERT INTO muted_dc_users(dc_user_id,muted_until,reason) VALUES(?,?,?) ON DUPLICATE KEY UPDATE muted_until=?,reason=?',[message.author.id,until,"AI: So'kinish",until,"AI: So'kinish"]).catch(()=>{})
        await message.delete().catch(()=>{})
        await message.author.send(`⚠️ Xabaringiz o'chirildi! ${mins} daqiqa mute.`).catch(()=>{})
      }
    } catch {}
  }

  if (!content.startsWith('/')) return
  const args = content.slice(1).trim().split(/\s+/)
  const cmd = args[0].toLowerCase()

  const dcUser = await getDcUser(message.author.id)
  const playerInfo = dcUser ? await getPlayer(dcUser.player_name) : null
  const isAdmin = playerInfo && playerInfo.admin >= 1

  // ─── PUBLIC ───
  if (cmd === 'help' || cmd === 'commands' || cmd === 'start') {
    if (isAdmin) {
      const embed = new EmbedBuilder().setColor('#7C3AED').setTitle('🛡️ Admin Buyruqlari')
        .addFields(
          {name:'👤 Profil',value:'`/profil <nick>` `/online` `/top`',inline:false},
          {name:'⚖️ Jazo',value:'`/ban <nick> <vaqt> <sabab>`\n`/mute <nick> <daqiqa> <sabab>`\n`/warn <nick> <sabab>`\n`/jail <nick> <daqiqa> <sabab>`\n`/kick <nick> <sabab>`',inline:false},
          {name:'🔓 Bekor',value:'`/unban <nick>` `/unmute <nick>` `/unwarn <nick>` `/unjail <nick>`',inline:false},
          {name:'💰 Moliya',value:'`/pul <nick> <miqdor>` `/olpul <nick> <miqdor>`',inline:false},
          {name:'🎮 O\'yin',value:'`/setlevel <nick> <daraja>` `/hp <nick> <miqdor>` `/heal <nick>`',inline:false},
          {name:'📊 Faollik',value:'`/myactive` `/myactive7` `/mycomplaints` `/mycomplaints7` `/admins` `/banlist`',inline:false},
        ).setFooter({text:'Shadows RP Admin'})
      await message.reply({embeds:[embed]})
    } else {
      const embed = new EmbedBuilder().setColor('#7C3AED').setTitle('📋 Shadows RP Buyruqlari')
        .addFields(
          {name:'👤 Profil',value:'`/profil <nick>` — profil\n`/top` — reyting\n`/online` — onlayn',inline:false},
          {name:'💰 Moliya',value:'`/mypul` — mening pulim\n`/transfer <nick> <miqdor>` — pul o\'tkazish',inline:false},
          {name:'🔗 Bog\'lanish',value:'`/setdc <nick>` — akkaunt bog\'lash\n`/myid` — Discord ID',inline:false},
          {name:'📰 Ma\'lumot',value:'`/yangiliklar` `/server`',inline:false},
        )
      await message.reply({embeds:[embed]})
    }
    await message.react(client.emojis.cache.get(EMOJI_OK)||'✅').catch(()=>{})
    return
  }

  if (cmd === 'myid') { await message.reply(`🆔 Discord ID: \`${message.author.id}\``); return }

  if (cmd === 'setdc') {
    const nick = args[1]
    if (!nick) { await message.reply('❌ `/setdc <Nick_Name>`'); return }
    const p = await getPlayer(nick)
    if (!p) { await message.reply('❌ Bunday oyinchi topilmadi!'); return }
    if (sitePool) {
      await sitePool.query('INSERT INTO admin_dc_users(player_name,dc_user_id,dc_username) VALUES(?,?,?) ON DUPLICATE KEY UPDATE dc_user_id=?,dc_username=?',
        [nick,message.author.id,message.author.username,message.author.id,message.author.username]).catch(e=>console.error(e.message))
    }
    await message.reply(`✅ **${nick}** Discord ga bog'landi!`)
    await message.react(client.emojis.cache.get(EMOJI_OK)||'✅').catch(()=>{})
    return
  }

  if (cmd === 'profil' || cmd === 'p') {
    const nick = args[1] || dcUser?.player_name
    if (!nick) { await message.reply('❌ `/profil <Nick_Name>`'); return }
    const p = await getPlayer(nick)
    if (!p) { await message.reply('❌ Oyinchi topilmadi!'); return }
    const embed = new EmbedBuilder()
      .setColor(p.online==1?0x10B981:0x6B6B8A)
      .setTitle(`👤 ${p.name}`)
      .setDescription(`${teamNames[p.team]||'Fuqaro'} • Daraja ${p.level}`)
      .addFields(
        {name:'💰 Naqd',value:`$${fmt(p.money)}`,inline:true},
        {name:'🏦 Bank',value:`$${fmt(p.bank)}`,inline:true},
        {name:'⭐ Score',value:`${p.score||0}`,inline:true},
        {name:'⏱️ Vaqt',value:`${p.totalhour||0} soat`,inline:true},
        {name:'🛡️ Admin',value:adminLvl[parseInt(p.admin)]||"O'yinchi",inline:true},
        {name:'⚠️ Warn',value:`${p.warn||0}/3`,inline:true},
        {name:'🌐 Holat',value:p.online==1?'🟢 Onlayn':'⚫ Oflayn',inline:true},
        {name:'🏥 HP',value:`${p.health||100}/100`,inline:true},
        {name:'💎 Premium',value:p.premium==1?'✅':'❌',inline:true},
      )
    await message.reply({embeds:[embed]})
    await message.react(client.emojis.cache.get(EMOJI_OK)||'✅').catch(()=>{})
    return
  }

  if (cmd === 'top') {
    const type = args[1]||'level'
    const om = {level:'level',money:'money',score:'score',hours:'totalhour'}
    const order = om[type]||'level'
    const [players] = await gamePool.query(`SELECT name,level,money,score,totalhour,online FROM accounts ORDER BY ${order} DESC LIMIT 10`).catch(()=>[[]])
    const medals = ['🥇','🥈','🥉','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟']
    const desc = players.map((p,i)=>{
      const val = type==='money'?`$${fmt(p.money)}`:type==='hours'?`${p.totalhour||0}s`:type==='score'?`${p.score||0}pt`:`${p.level}lvl`
      return `${medals[i]} **${p.name}** — ${val} ${p.online==1?'🟢':''}`
    }).join('\n')
    const embed = new EmbedBuilder().setColor('#F59E0B').setTitle(`🏆 Top 10 — ${type}`).setDescription(desc||"Ma'lumot yo'q")
    await message.reply({embeds:[embed]})
    await message.react(client.emojis.cache.get(EMOJI_OK)||'✅').catch(()=>{})
    return
  }

  if (cmd === 'online') {
    const [players] = await gamePool.query('SELECT name,level,team FROM accounts WHERE online=1 ORDER BY level DESC LIMIT 25').catch(()=>[[]])
    const embed = new EmbedBuilder().setColor('#10B981').setTitle(`🟢 Onlayn (${players.length})`)
    embed.setDescription(players.length?players.map(p=>`• **${p.name}** (${p.level}lvl) — ${teamNames[p.team]||'Fuqaro'}`).join('\n').slice(0,2000):"Hech kim onlayn emas")
    await message.reply({embeds:[embed]})
    return
  }

  if (cmd === 'mypul') {
    const nick = dcUser?.player_name
    if (!nick) { await message.reply('❌ Avval `/setdc <nick>` bilan bog\'lang!'); return }
    const p = await getPlayer(nick)
    if (!p) { await message.reply('❌ Topilmadi!'); return }
    await message.reply(`💰 **${p.name}**\nNaqd: **$${fmt(p.money)}**\nBank: **$${fmt(p.bank)}**`)
    return
  }

  if (cmd === 'transfer') {
    if (!dcUser?.player_name) { await message.reply('❌ Avval `/setdc <nick>` bilan bog\'lang!'); return }
    const toNick=args[1], amount=parseInt(args[2])
    if (!toNick||!amount||amount<=0) { await message.reply('❌ `/transfer <Nick_Name> <miqdor>`'); return }
    const from = await getPlayer(dcUser.player_name)
    const to = await getPlayer(toNick)
    if (!from) { await message.reply('❌ Sizning akkauntingiz topilmadi!'); return }
    if (!to) { await message.reply('❌ Qabul qiluvchi topilmadi!'); return }
    if (from.money<amount) { await message.reply(`❌ Yetarli pul yo'q! Sizda: $${fmt(from.money)}`); return }
    if (amount>10000000) { await message.reply('❌ Maksimal: $10,000,000'); return }
    if (from.name===toNick) { await message.reply("❌ O'zingizga o'tkaza olmaysiz!"); return }
    await gamePool.query('UPDATE accounts SET money=money-? WHERE name=?',[amount,from.name])
    await gamePool.query('UPDATE accounts SET money=money+? WHERE name=?',[amount,toNick])
    await message.reply(`✅ **$${fmt(amount)}** **${from.name}** → **${toNick}**`)
    await message.react(client.emojis.cache.get(EMOJI_OK)||'✅').catch(()=>{})
    return
  }

  if (cmd === 'yangiliklar') {
    if (!sitePool) { await message.reply('❌ DB ulangmagan'); return }
    const [news] = await sitePool.query('SELECT id,title,category,created_at FROM news WHERE published=1 ORDER BY created_at DESC LIMIT 5').catch(()=>[[]])
    const embed = new EmbedBuilder().setColor('#7C3AED').setTitle('📰 Yangiliklar')
    embed.setDescription(news.length?news.map(n=>`• **${n.title}** (${n.category})`).join('\n\n'):"Yangilik yo'q")
    await message.reply({embeds:[embed]})
    return
  }

  if (cmd === 'server') {
    const [[{total}]] = await gamePool.query('SELECT COUNT(*) as total FROM accounts').catch(()=>[[{total:0}]])
    const [[{online}]] = await gamePool.query('SELECT COUNT(*) as online FROM accounts WHERE online=1').catch(()=>[[{online:0}]])
    const embed = new EmbedBuilder().setColor('#7C3AED').setTitle('🎮 Shadows RP')
      .addFields(
        {name:'🌐 IP',value:'play.shadowsrp.uz',inline:true},
        {name:'🟢 Onlayn',value:`${online}`,inline:true},
        {name:'👥 Jami',value:`${total}`,inline:true},
      )
    await message.reply({embeds:[embed]})
    return
  }

  // ─── ADMIN BUYRUQLAR ───
  if (!isAdmin) {
    await message.react(client.emojis.cache.get(EMOJI_REJECT)||'❌').catch(()=>{})
    await message.reply({content:`❌ Bu buyruq faqat adminlar uchun! Avval \`/setdc <nick>\` bilan bog'lang.`,allowedMentions:{repliedUser:false}})
    return
  }

  await message.react(client.emojis.cache.get(EMOJI_OK)||'✅').catch(()=>{})

  if (cmd === 'myactive' || cmd === 'myactiveday') {
    if (!sitePool) { await message.reply('❌ DB ulangmagan'); return }
    const [r] = await sitePool.query('SELECT * FROM admin_activity WHERE player_name=? AND date=?',[playerInfo.name,today()]).catch(()=>[[]])
    const d = r[0]||{}
    const embed = new EmbedBuilder().setColor('#7C3AED').setTitle(`📊 ${playerInfo.name} — Bugun`)
      .addFields(
        {name:'⏱️ Online',value:`${d.online_minutes||0} daqiqa`,inline:true},
        {name:'📋 Report',value:`${d.reports_checked||0}`,inline:true},
        {name:'📝 Shikoyat',value:`${d.complaints_closed||0}`,inline:true},
        {name:'⚖️ Jazo',value:`${d.punishments_given||0}`,inline:true},
      ).setFooter({text:today()})
    await message.reply({embeds:[embed]})
    return
  }

  if (cmd === 'myactive7') {
    if (!sitePool) { await message.reply('❌ DB ulangmagan'); return }
    const [r] = await sitePool.query('SELECT SUM(online_minutes) as mins,SUM(reports_checked) as reports,SUM(complaints_closed) as complaints,SUM(punishments_given) as punishments FROM admin_activity WHERE player_name=? AND date>=DATE_SUB(CURDATE(),INTERVAL 7 DAY)',[playerInfo.name]).catch(()=>[[{}]])
    const d=r[0]||{}
    const embed = new EmbedBuilder().setColor('#7C3AED').setTitle(`📊 ${playerInfo.name} — Hafta`)
      .addFields(
        {name:'⏱️ Online',value:`${d.mins||0} daqiqa`,inline:true},
        {name:'📋 Report',value:`${d.reports||0}`,inline:true},
        {name:'📝 Shikoyat',value:`${d.complaints||0}`,inline:true},
        {name:'⚖️ Jazo',value:`${d.punishments||0}`,inline:true},
      ).setFooter({text:'Oxirgi 7 kun'})
    await message.reply({embeds:[embed]})
    return
  }

  if (cmd === 'mycomplaints' || cmd === 'mycomplaintsday') {
    if (!sitePool) { await message.reply('❌ DB ulangmagan'); return }
    const [r] = await sitePool.query("SELECT COUNT(*) as cnt FROM complaints WHERE closed_by=? AND DATE(updated_at)=CURDATE()",[playerInfo.name]).catch(()=>[[{cnt:0}]])
    await message.reply(`📝 **${playerInfo.name}** bugun **${r[0].cnt}** ta shikoyat yopdi!`)
    return
  }

  if (cmd === 'mycomplaints7') {
    if (!sitePool) { await message.reply('❌ DB ulangmagan'); return }
    const [r] = await sitePool.query("SELECT COUNT(*) as cnt FROM complaints WHERE closed_by=? AND updated_at>=DATE_SUB(NOW(),INTERVAL 7 DAY)",[playerInfo.name]).catch(()=>[[{cnt:0}]])
    await message.reply(`📝 **${playerInfo.name}** haftalik **${r[0].cnt}** ta shikoyat yopdi!`)
    return
  }

  if (cmd === 'admins') {
    const [admins] = await gamePool.query('SELECT name,admin,online,totalhour FROM accounts WHERE admin>0 ORDER BY admin DESC LIMIT 20').catch(()=>[[]])
    let desc = ''
    for (const a of admins) {
      let mention = ''
      if (sitePool) {
        const [dc] = await sitePool.query('SELECT dc_user_id FROM admin_dc_users WHERE player_name=?',[a.name]).catch(()=>[[]])
        if (dc[0]?.dc_user_id) mention = `<@${dc[0].dc_user_id}>`
      }
      desc += `${a.online==1?'🟢':'⚫'} **${a.name}** (${adminLvl[a.admin]||'Admin'}) ${mention}\n`
    }
    const embed = new EmbedBuilder().setColor('#9D4EDD').setTitle('🛡️ Adminlar').setDescription(desc||"Yo'q")
    await message.reply({embeds:[embed]})
    return
  }

  if (cmd === 'banlist') {
    const [bans] = await gamePool.query('SELECT player,admin,reason FROM ban_list ORDER BY id DESC LIMIT 10').catch(()=>[[]])
    const embed = new EmbedBuilder().setColor('#EF4444').setTitle('⛔ Ban Ro\'yxati')
    embed.setDescription(bans.length?bans.map(b=>`• **${b.player}** — ${b.reason||'?'} (${b.admin})`).join('\n'):"Yo'q")
    await message.reply({embeds:[embed]})
    return
  }

  if (cmd === 'postnews') {
    if (playerInfo.admin < 5) { await message.reply('❌ Faqat Co-Owner+!'); return }
    const title=args[1]||'Yangilik', text=args.slice(2).join(' ')
    if (!text) { await message.reply('❌ `/postnews <sarlavha> <matn>`'); return }
    const ch = await client.channels.fetch(CH_SERVER_NEWS).catch(()=>null)
    if (!ch) { await message.reply('❌ Kanal topilmadi!'); return }
    const embed = new EmbedBuilder().setColor('#7C3AED').setTitle(`📰 ${title}`).setDescription(text).setTimestamp().setFooter({text:`Shadows RP | ${playerInfo.name}`})
    await ch.send({embeds:[embed]})
    await message.reply('✅ Yangilik yuborildi!')
    return
  }

  // Jazo buyruqlar
  const punishCmds = {
    ban: async () => {
      const nick=args[1],dur=args[2],reason=args.slice(3).join(' ')
      if (!nick||!reason) return '❌ `/ban <nick> <vaqt> <sabab>`'
      const t=await getPlayer(nick); if (!t) return '❌ Oyinchi topilmadi!'
      if (t.admin>=playerInfo.admin) return '❌ Bu oyinchiga jazo bera olmaysiz!'
      await gamePool.query("INSERT INTO ban_list(player,admin,reason,date) VALUES(?,?,?,NOW()) ON DUPLICATE KEY UPDATE reason=?,admin=?",[nick,playerInfo.name,reason,reason,playerInfo.name]).catch(()=>{})
      await logPunishment(playerInfo.name,nick,'BAN',reason,dur||'Permanent',client)
      return `⛔ **${nick}** banland! | ${reason} | ${dur||'Permanent'}`
    },
    unban: async () => {
      const nick=args[1]; if (!nick) return '❌ `/unban <nick>`'
      await gamePool.query("DELETE FROM ban_list WHERE player=?",[nick]).catch(()=>{})
      await logPunishment(playerInfo.name,nick,'UNBAN','Bekor',null,client)
      return `✅ **${nick}** ban bekor!`
    },
    kick: async () => {
      const nick=args[1],reason=args.slice(2).join(' ')||'Qoidabuzarlik'
      if (!nick) return '❌ `/kick <nick> <sabab>`'
      const t=await getPlayer(nick); if (!t) return '❌ Oyinchi topilmadi!'
      await logPunishment(playerInfo.name,nick,'KICK',reason,null,client)
      return `👢 **${nick}** kicklandi! | ${reason}`
    },
    warn: async () => {
      const nick=args[1],reason=args.slice(2).join(' ')
      if (!nick||!reason) return '❌ `/warn <nick> <sabab>`'
      const t=await getPlayer(nick); if (!t) return '❌ Oyinchi topilmadi!'
      const w=(t.warn||0)+1
      await gamePool.query('UPDATE accounts SET warn=? WHERE name=?',[w,nick])
      await logPunishment(playerInfo.name,nick,'WARN',reason,null,client)
      return `⚠️ **${nick}** warn (${w}/3) | ${reason}`
    },
    unwarn: async () => {
      const nick=args[1]; if (!nick) return '❌ `/unwarn <nick>`'
      await gamePool.query('UPDATE accounts SET warn=GREATEST(0,warn-1) WHERE name=?',[nick])
      await logPunishment(playerInfo.name,nick,'UNWARN','1 warn olindi',null,client)
      return `✅ **${nick}** warn olindi!`
    },
    mute: async () => {
      const nick=args[1],dur=parseInt(args[2])||30,reason=args.slice(3).join(' ')||'Qoidabuzarlik'
      if (!nick) return '❌ `/mute <nick> <daqiqa> <sabab>`'
      await gamePool.query('UPDATE accounts SET mute=? WHERE name=?',[dur,nick])
      await logPunishment(playerInfo.name,nick,'MUTE',reason,`${dur} daqiqa`,client)
      return `🔇 **${nick}** ${dur} daqiqa mute | ${reason}`
    },
    unmute: async () => {
      const nick=args[1]; if (!nick) return '❌ `/unmute <nick>`'
      await gamePool.query('UPDATE accounts SET mute=0 WHERE name=?',[nick])
      await logPunishment(playerInfo.name,nick,'UNMUTE','Bekor',null,client)
      return `🔊 **${nick}** mute bekor!`
    },
    jail: async () => {
      const nick=args[1],dur=parseInt(args[2])||30,reason=args.slice(3).join(' ')||'Qoidabuzarlik'
      if (!nick) return '❌ `/jail <nick> <daqiqa> <sabab>`'
      await gamePool.query('UPDATE accounts SET jail=? WHERE name=?',[dur,nick])
      await logPunishment(playerInfo.name,nick,'JAIL',reason,`${dur} daqiqa`,client)
      return `🔒 **${nick}** ${dur} daqiqa qamoq | ${reason}`
    },
    unjail: async () => {
      const nick=args[1]; if (!nick) return '❌ `/unjail <nick>`'
      await gamePool.query('UPDATE accounts SET jail=0 WHERE name=?',[nick])
      await logPunishment(playerInfo.name,nick,'UNJAIL','Bekor',null,client)
      return `🔓 **${nick}** qamoqdan chiqdi!`
    },
    pul: async () => {
      if (playerInfo.admin<3) return '❌ Min Admin 3!'
      const nick=args[1],amount=parseInt(args[2])
      if (!nick||!amount) return '❌ `/pul <nick> <miqdor>`'
      await gamePool.query('UPDATE accounts SET money=money+? WHERE name=?',[amount,nick])
      if (sitePool) await sitePool.query('INSERT INTO admin_logs(admin_name,action,details) VALUES(?,?,?)',[playerInfo.name,'Pul berish',`${nick} $${fmt(amount)}`]).catch(()=>{})
      return `💰 **${nick}** ga **$${fmt(amount)}** berildi!`
    },
    olpul: async () => {
      if (playerInfo.admin<3) return '❌ Min Admin 3!'
      const nick=args[1],amount=parseInt(args[2])
      if (!nick||!amount) return '❌ `/olpul <nick> <miqdor>`'
      await gamePool.query('UPDATE accounts SET money=GREATEST(0,money-?) WHERE name=?',[amount,nick])
      if (sitePool) await sitePool.query('INSERT INTO admin_logs(admin_name,action,details) VALUES(?,?,?)',[playerInfo.name,'Pul olish',`${nick} $${fmt(amount)}`]).catch(()=>{})
      return `💸 **${nick}** dan **$${fmt(amount)}** olindi!`
    },
    setlevel: async () => {
      if (playerInfo.admin<4) return '❌ Min Admin 4!'
      const nick=args[1],level=parseInt(args[2])
      if (!nick||!level) return '❌ `/setlevel <nick> <daraja>`'
      await gamePool.query('UPDATE accounts SET level=? WHERE name=?',[Math.min(Math.max(level,1),100),nick])
      if (sitePool) await sitePool.query('INSERT INTO admin_logs(admin_name,action,details) VALUES(?,?,?)',[playerInfo.name,'Daraja',`${nick} → ${level}`]).catch(()=>{})
      return `⭐ **${nick}** daraja **${level}**!`
    },
    hp: async () => {
      const nick=args[1],hp=parseInt(args[2])||100
      if (!nick) return '❌ `/hp <nick> <miqdor>`'
      await gamePool.query('UPDATE accounts SET health=? WHERE name=?',[Math.min(hp,100),nick])
      return `💊 **${nick}** HP **${Math.min(hp,100)}**!`
    },
    heal: async () => {
      const nick=args[1]; if (!nick) return '❌ `/heal <nick>`'
      await gamePool.query('UPDATE accounts SET health=100 WHERE name=?',[nick])
      return `💊 **${nick}** to'liq davolandi!`
    },
  }

  if (punishCmds[cmd]) {
    try {
      const result = await punishCmds[cmd]()
      await message.reply({content:result, allowedMentions:{repliedUser:false}})
    } catch(e) {
      await message.reply(`❌ Xato: ${e.message}`)
    }
    return
  }

  // Noma'lum buyruq
  await message.react(client.emojis.cache.get(EMOJI_REJECT)||'❌').catch(()=>{})
  await message.reply({content:`❌ Noma'lum buyruq. \`/help\` yozing.`,allowedMentions:{repliedUser:false}})
})

// ═══ START ═══
async function start() {
  await initDB()
  try {
    await client.login(TOKEN)
  } catch(e) {
    console.error('Bot login xatosi:', e.message)
    process.exit(1)
  }
}

start()
