require('dotenv').config()
const { Client, GatewayIntentBits, Partials, EmbedBuilder } = require('discord.js')
const mysql = require('mysql2/promise')
const { GoogleGenerativeAI } = require('@google/generative-ai')

// ═══ CONFIG ═══
const TOKEN = process.env.DISCORD_TOKEN || 'MTUyMDUxNzU1MDM4NjE4NDI0Mw.G9McQC.wrYP6Et-bjfKpwroxbPeXG_oCdMnWz9iwIJ2Ig'
const OWNER_NICK = process.env.OWNER_NICK || 'Nodirbek_Hatred'

const CH_SERVER_NEWS  = '1500773549554798602'
const CH_ADMIN_NEWS   = '1500945593407639715'
const CH_GAME_CHAT    = '1501055278827704551'
const CH_PUNISHMENTS  = '1501081847046865057'
const GUILD_MAIN      = '1500771666027085836'
const GUILD_ADMIN     = '1500945591281258729'
const ROLE_MEMBER     = '1500772487896629298'
const ROLE_ADMIN      = '1500953705405485158'
const EMOJI_OK        = '1520802211498688702'
const EMOJI_REJECT    = '1520802491783188500'
const EMOJI_WARN      = '1520803081359458364'
const EMOJI_PUNISH    = '1520805096202436738'
const EMOJI_ADMIN_REQ = '1520805645140361296'

// ═══ DB ═══
const GAME_DB = {
  host:'188.127.241.8', port:3306,
  user:'gs136593', password:'bT4B4WGCkdCr',
  database:'gs136593', waitForConnections:true, connectionLimit:5, connectTimeout:15000
}
const SITE_DB = {
  host: process.env.SITE_DB_HOST || 'mysql.railway.internal',
  port: parseInt(process.env.SITE_DB_PORT || '3306'),
  user: process.env.SITE_DB_USER || 'root',
  password: process.env.SITE_DB_PASS || '',
  database: process.env.SITE_DB_NAME || 'railway',
  waitForConnections:true, connectionLimit:5, connectTimeout:15000
}

let gamePool, sitePool

async function initDB() {
  gamePool = mysql.createPool(GAME_DB)
  sitePool = mysql.createPool(SITE_DB)
  await gamePool.query('SELECT 1')
  await sitePool.query('SELECT 1')
  console.log('✅ DB ulandi!')
  await createTables()
}

async function createTables() {
  await sitePool.query(`CREATE TABLE IF NOT EXISTS admin_dc_users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    player_name VARCHAR(64) NOT NULL UNIQUE,
    dc_user_id VARCHAR(64), dc_username VARCHAR(64),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)

  await sitePool.query(`CREATE TABLE IF NOT EXISTS admin_activity (
    id INT AUTO_INCREMENT PRIMARY KEY,
    player_name VARCHAR(64) NOT NULL,
    online_minutes INT DEFAULT 0,
    reports_checked INT DEFAULT 0,
    complaints_closed INT DEFAULT 0,
    punishments_given INT DEFAULT 0,
    date DATE NOT NULL,
    UNIQUE KEY dp (player_name, date)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)

  await sitePool.query(`CREATE TABLE IF NOT EXISTS muted_dc_users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    dc_user_id VARCHAR(64) NOT NULL UNIQUE,
    muted_until DATETIME NOT NULL,
    reason TEXT
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)

  await sitePool.query(`CREATE TABLE IF NOT EXISTS punishment_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    admin_nick VARCHAR(64), player_nick VARCHAR(64),
    type VARCHAR(32), reason TEXT, duration VARCHAR(32),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)

  console.log('✅ Jadvallar tayyor!')
}

// ═══ HELPERS ═══
const fmt = v => Number(v||0).toLocaleString('ru-RU')
const teamNames = {0:'Fuqaro',1:'Politsiya',2:'Tibbiyot',3:'Armiya',4:'SWAT',5:'FIB',6:'Sheriff',7:"Yong'inchi",8:'Mehnat',9:"Yo'l xizmati"}
const adminLvl = {0:"O'yinchi",1:'Yangi Admin',2:'Admin',3:'Senior Admin',4:'Bosh Admin',5:'Co-Owner',6:'Super Admin',13:'Owner'}
const today = () => new Date().toISOString().split('T')[0]

async function getPlayer(name) {
  const [r] = await gamePool.query('SELECT * FROM accounts WHERE name=?', [name])
  return r[0] || null
}

async function getDcUser(dcId) {
  const [r] = await sitePool.query('SELECT * FROM admin_dc_users WHERE dc_user_id=?', [dcId])
  return r[0] || null
}

async function getGeminiKeys() {
  try {
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
      const model = ai.getGenerativeModel({ model:'gemini-2.0-flash' })
      const res = await model.generateContent(`Quyidagi matnda so'kinish, haqorat, munosib bo'lmagan so'z bormi? Faqat "true" yoki "false" deb javob ber:\n"${text}"`)
      return res.response.text().trim().toLowerCase().includes('true')
    } catch { continue }
  }
  return false
}

async function logActivity(playerName, field) {
  try {
    await sitePool.query(
      `INSERT INTO admin_activity(player_name,date,${field}) VALUES(?,?,1) ON DUPLICATE KEY UPDATE ${field}=${field}+1`,
      [playerName, today()]
    )
  } catch {}
}

async function logPunishment(adminNick, playerNick, type, reason, duration, client) {
  try {
    const ch = await client.channels.fetch(CH_PUNISHMENTS).catch(() => null)
    if (!ch) return
    const [dc] = await sitePool.query('SELECT dc_user_id FROM admin_dc_users WHERE player_name=?', [adminNick])
    const adminMention = dc[0]?.dc_user_id ? `<@${dc[0].dc_user_id}>` : `<@&${ROLE_ADMIN}> **${adminNick}**`
    const typeEmoji = {BAN:'⛔',KICK:'👢',MUTE:'🔇',WARN:'⚠️',JAIL:'🔒',UNWARN:'✅',UNBAN:'✅',UNMUTE:'🔊',UNJAIL:'🔓'}
    const typeColor = {BAN:0xEF4444,KICK:0xF59E0B,MUTE:0x9D4EDD,WARN:0xF59E0B,JAIL:0xEF4444}
    const embed = new EmbedBuilder()
      .setColor(typeColor[type] || 0x9D4EDD)
      .setTitle(`${typeEmoji[type]||'⚖️'} ${type} — ${playerNick}`)
      .addFields(
        { name:'👮 Admin', value:adminMention, inline:true },
        { name:'🎯 Oyinchi', value:`**${playerNick}**`, inline:true },
        { name:'📋 Sabab', value:reason||"Ko'rsatilmagan", inline:false },
        ...(duration?[{name:'⏱️ Vaqt',value:duration,inline:true}]:[])
      ).setTimestamp()
    await ch.send({ embeds:[embed] })
    await sitePool.query('INSERT INTO punishment_logs(admin_nick,player_nick,type,reason,duration) VALUES(?,?,?,?,?)',
      [adminNick, playerNick, type, reason, duration||null])
    await logActivity(adminNick, 'punishments_given')
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
  ],
  partials: [Partials.Channel, Partials.Message]
})

client.once('ready', async () => {
  console.log(`✅ Bot tayyor: ${client.user.tag}`)
  // Barcha a'zolarga rol berish
  for (const gid of [GUILD_MAIN, GUILD_ADMIN]) {
    try {
      const guild = await client.guilds.fetch(gid)
      const members = await guild.members.fetch()
      const role = guild.roles.cache.get(ROLE_MEMBER)
      if (role) for (const [,m] of members) {
        if (!m.roles.cache.has(ROLE_MEMBER) && !m.user.bot) await m.roles.add(role).catch(() => {})
      }
    } catch {}
  }
})

client.on('guildMemberAdd', async member => {
  try {
    const role = member.guild.roles.cache.get(ROLE_MEMBER)
    if (role) await member.roles.add(role)
  } catch {}
})

client.on('messageCreate', async message => {
  if (message.author.bot) return
  const content = message.content.trim()
  const channelId = message.channel.id

  // Toxicity check - server yangiliklar kanali
  if (channelId === CH_SERVER_NEWS && content.length > 3 && !content.startsWith('/')) {
    try {
      const [muted] = await sitePool.query('SELECT * FROM muted_dc_users WHERE dc_user_id=? AND muted_until>NOW()', [message.author.id])
      if (muted.length > 0) {
        await message.delete().catch(() => {})
        await message.author.send(`❌ Siz ${new Date(muted[0].muted_until).toLocaleString('uz-UZ')} gacha mutesiz!`).catch(() => {})
        return
      }
      const toxic = await checkToxic(content)
      if (toxic) {
        const mins = [30,60,120,480,1440][Math.floor(Math.random()*5)]
        const until = new Date(Date.now() + mins*60000)
        await sitePool.query('INSERT INTO muted_dc_users(dc_user_id,muted_until,reason) VALUES(?,?,?) ON DUPLICATE KEY UPDATE muted_until=?,reason=?',
          [message.author.id, until, "AI: So'kinish", until, "AI: So'kinish"])
        await message.delete().catch(() => {})
        await message.author.send(`⚠️ Xabaringiz o'chirildi! ${mins} daqiqa mute oldingiz. Sabab: Munosib bo'lmagan so'z.`).catch(() => {})
        return
      }
    } catch {}
  }

  if (!content.startsWith('/')) return

  const args = content.slice(1).trim().split(/\s+/)
  const cmd = args[0].toLowerCase()

  // DC user ma'lumoti
  const dcUser = await getDcUser(message.author.id)
  const playerInfo = dcUser ? await getPlayer(dcUser.player_name) : null
  const isAdmin = playerInfo && playerInfo.admin >= 1
  const isOwner = playerInfo && (playerInfo.name === OWNER_NICK || playerInfo.admin >= 13)

  // ─── PUBLIC COMMANDS ───
  if (cmd === 'help' || cmd === 'commands' || cmd === 'start') {
    if (isAdmin) {
      const embed = new EmbedBuilder().setColor('#7C3AED').setTitle('🛡️ Admin Buyruqlari')
        .addFields(
          {name:'👤 Profil',value:'`/profil <nick>` `/online` `/top [level|money|score]`',inline:false},
          {name:'⚖️ Jazo',value:'`/ban <nick> <vaqt> <sabab>`\n`/mute <nick> <daqiqa> <sabab>`\n`/warn <nick> <sabab>`\n`/jail <nick> <daqiqa> <sabab>`\n`/kick <nick> <sabab>`',inline:false},
          {name:'🔓 Bekor',value:'`/unban <nick>` `/unmute <nick>`\n`/unwarn <nick>` `/unjail <nick>`',inline:false},
          {name:'💰 Moliya',value:'`/pul <nick> <miqdor>` `/olpul <nick> <miqdor>`',inline:false},
          {name:'🎮 O\'yin',value:'`/setlevel <nick> <daraja>` `/hp <nick> <miqdor>`\n`/heal <nick>`',inline:false},
          {name:'📊 Faollik',value:'`/myactive` `/myactive7` `/mycomplaints` `/mycomplaints7`\n`/admins` `/banlist`',inline:false},
          {name:'📰 Yangilik',value:'`/postnews <sarlavha> <matn>`',inline:false},
        ).setFooter({text:'Shadows RP Admin Bot'})
      await message.reply({ embeds:[embed] })
    } else {
      const embed = new EmbedBuilder().setColor('#7C3AED').setTitle('📋 Shadows RP Buyruqlari')
        .addFields(
          {name:'👤 Profil',value:'`/profil <nick>` — Oyinchi profili\n`/top` — Reyting\n`/online` — Onlayn oyinchilar',inline:false},
          {name:'💰 Moliya',value:'`/mypul` — Mening pulim\n`/transfer <nick> <miqdor>` — Pul o\'tkazish',inline:false},
          {name:'📰 Ma\'lumot',value:'`/yangiliklar` — So\'nggi yangiliklar\n`/server` — Server info',inline:false},
          {name:'🔗 Bog\'lanish',value:'`/setdc <nick>` — DC akkaunt bog\'lash\n`/myid` — Discord ID im',inline:false},
        ).setFooter({text:'Shadows RP'})
      await message.reply({ embeds:[embed] })
    }
    await message.react(client.emojis.cache.get(EMOJI_OK)||'✅').catch(()=>{})
    return
  }

  if (cmd === 'myid') {
    await message.reply(`🆔 Sizning Discord ID: \`${message.author.id}\``)
    return
  }

  if (cmd === 'setdc') {
    const nick = args[1]
    if (!nick) { await message.reply('❌ `/setdc <Nick_Name>`'); return }
    const p = await getPlayer(nick)
    if (!p) { await message.reply('❌ Bunday oyinchi topilmadi!'); return }
    await sitePool.query('INSERT INTO admin_dc_users(player_name,dc_user_id,dc_username) VALUES(?,?,?) ON DUPLICATE KEY UPDATE dc_user_id=?,dc_username=?',
      [nick, message.author.id, message.author.username, message.author.id, message.author.username])
    await message.reply(`✅ **${nick}** akkauntingiz Discord ga bog'landi!\nEndi admin buyruqlaridan foydalanishingiz mumkin.`)
    await message.react(client.emojis.cache.get(EMOJI_OK)||'✅').catch(()=>{})
    return
  }

  if (cmd === 'profil' || cmd === 'p') {
    const nick = args[1] || dcUser?.player_name
    if (!nick) { await message.reply('❌ `/profil <Nick_Name>`'); return }
    const p = await getPlayer(nick).catch(() => null)
    if (!p) { await message.reply('❌ Oyinchi topilmadi!'); return }
    const embed = new EmbedBuilder()
      .setColor(p.online==1?0x10B981:0x6B6B8A)
      .setTitle(`👤 ${p.name}`)
      .setDescription(`**${teamNames[p.team]||'Fuqaro'}** • Daraja ${p.level}`)
      .addFields(
        {name:'💰 Naqd',value:`$${fmt(p.money)}`,inline:true},
        {name:'🏦 Bank',value:`$${fmt(p.bank)}`,inline:true},
        {name:'⭐ Score',value:`${p.score||0}`,inline:true},
        {name:'⏱️ Vaqt',value:`${p.totalhour||0} soat`,inline:true},
        {name:'🛡️ Admin',value:adminLvl[parseInt(p.admin)]||"O'yinchi",inline:true},
        {name:'💎 Premium',value:p.premium==1?'✅':'❌',inline:true},
        {name:'⚠️ Warn',value:`${p.warn||0}/3`,inline:true},
        {name:'🏥 HP',value:`${p.health||100}/100`,inline:true},
        {name:'🌐 Holat',value:p.online==1?'🟢 Onlayn':'⚫ Oflayn',inline:true},
      )
    await message.reply({ embeds:[embed] })
    await message.react(client.emojis.cache.get(EMOJI_OK)||'✅').catch(()=>{})
    return
  }

  if (cmd === 'top') {
    const type = args[1] || 'level'
    const om = {level:'level',money:'money',score:'score',hours:'totalhour'}
    const order = om[type] || 'level'
    const [players] = await gamePool.query(`SELECT name,level,money,score,totalhour,online FROM accounts ORDER BY ${order} DESC LIMIT 10`)
    const medals = ['🥇','🥈','🥉','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟']
    let desc = players.map((p,i) => {
      const val = type==='money'?`$${fmt(p.money)}`:type==='hours'?`${p.totalhour||0}s`:type==='score'?`${p.score||0}pt`:`${p.level}lvl`
      return `${medals[i]} **${p.name}** — ${val} ${p.online==1?'🟢':''}`
    }).join('\n')
    const embed = new EmbedBuilder().setColor('#F59E0B').setTitle(`🏆 Top 10 — ${type.toUpperCase()}`).setDescription(desc)
    await message.reply({ embeds:[embed] })
    await message.react(client.emojis.cache.get(EMOJI_OK)||'✅').catch(()=>{})
    return
  }

  if (cmd === 'online') {
    const [players] = await gamePool.query('SELECT name,level,team FROM accounts WHERE online=1 ORDER BY level DESC LIMIT 25')
    const embed = new EmbedBuilder().setColor('#10B981').setTitle(`🟢 Onlayn Oyinchilar (${players.length})`)
    if (!players.length) embed.setDescription("Hech kim onlayn emas")
    else embed.setDescription(players.map(p=>`• **${p.name}** (${p.level}lvl) — ${teamNames[p.team]||'Fuqaro'}`).join('\n').slice(0,2000))
    await message.reply({ embeds:[embed] })
    return
  }

  if (cmd === 'mypul') {
    const nick = dcUser?.player_name
    if (!nick) { await message.reply('❌ Avval `/setdc <nick>` bilan bog\'lang!'); return }
    const p = await getPlayer(nick)
    if (!p) { await message.reply('❌ Topilmadi!'); return }
    await message.reply(`💰 **${p.name}**\nNaqd: **$${fmt(p.money)}**\nBank: **$${fmt(p.bank)}**\nDonat: **${p.donate_current||0} RUB**`)
    return
  }

  if (cmd === 'transfer') {
    if (!dcUser?.player_name) { await message.reply('❌ Avval `/setdc <nick>` bilan bog\'lang!'); return }
    const toNick = args[1], amount = parseInt(args[2])
    if (!toNick || !amount || amount<=0) { await message.reply('❌ `/transfer <Nick_Name> <miqdor>`'); return }
    const from = await getPlayer(dcUser.player_name)
    const to = await getPlayer(toNick)
    if (!from) { await message.reply('❌ Sizning akkauntingiz topilmadi!'); return }
    if (!to) { await message.reply('❌ Qabul qiluvchi topilmadi!'); return }
    if (from.money < amount) { await message.reply(`❌ Yetarli pul yo'q! Sizda: $${fmt(from.money)}`); return }
    if (amount > 10000000) { await message.reply('❌ Maksimal: $10,000,000'); return }
    if (from.name === toNick) { await message.reply("❌ O'zingizga pul o'tkaza olmaysiz!"); return }
    await gamePool.query('UPDATE accounts SET money=money-? WHERE name=?', [amount, from.name])
    await gamePool.query('UPDATE accounts SET money=money+? WHERE name=?', [amount, toNick])
    await message.reply(`✅ **$${fmt(amount)}** **${from.name}** → **${toNick}** ga o'tkazildi!`)
    await message.react(client.emojis.cache.get(EMOJI_OK)||'✅').catch(()=>{})
    return
  }

  if (cmd === 'yangiliklar' || cmd === 'news') {
    const [news] = await sitePool.query('SELECT id,title,category,created_at FROM news WHERE published=1 ORDER BY created_at DESC LIMIT 5')
    const embed = new EmbedBuilder().setColor('#7C3AED').setTitle('📰 So\'nggi Yangiliklar')
    if (!news.length) embed.setDescription("Yangilik yo'q")
    else embed.setDescription(news.map(n=>`• **${n.title}** (${n.category})\n  📅 ${new Date(n.created_at).toLocaleDateString('uz-UZ')}`).join('\n\n'))
    await message.reply({ embeds:[embed] })
    return
  }

  if (cmd === 'server') {
    const [[{total}]] = await gamePool.query('SELECT COUNT(*) as total FROM accounts')
    const [[{online}]] = await gamePool.query('SELECT COUNT(*) as online FROM accounts WHERE online=1')
    const [sets] = await sitePool.query("SELECT setting_key,setting_value FROM settings WHERE setting_key IN ('server_ip','apk_version')")
    const s={}; sets.forEach(r=>s[r.setting_key]=r.setting_value)
    const embed = new EmbedBuilder().setColor('#7C3AED').setTitle('🎮 Shadows RP')
      .addFields(
        {name:'🌐 IP',value:s.server_ip||'play.shadowsrp.uz',inline:true},
        {name:'🟢 Onlayn',value:`${online}`,inline:true},
        {name:'👥 Jami',value:`${total}`,inline:true},
        {name:'📱 APK',value:s.apk_version||'1.0.0',inline:true},
      )
    await message.reply({ embeds:[embed] })
    return
  }

  // ════ ADMIN BUYRUQLAR ════
  if (!isAdmin) {
    await message.react(client.emojis.cache.get(EMOJI_REJECT)||'❌').catch(()=>{})
    await message.reply({ content:`Bu buyruq faqat adminlar uchun! Avval \`/setdc <nick>\` bilan bog'lang.`, allowedMentions:{repliedUser:false} })
    return
  }

  await message.react(client.emojis.cache.get(EMOJI_OK)||'✅').catch(()=>{})

  if (cmd === 'myactive' || cmd === 'myactiveday') {
    const [r] = await sitePool.query('SELECT * FROM admin_activity WHERE player_name=? AND date=?', [playerInfo.name, today()])
    const d = r[0]||{}
    const embed = new EmbedBuilder().setColor('#7C3AED').setTitle(`📊 ${playerInfo.name} — Bugungi Faollik`)
      .addFields(
        {name:'⏱️ Online',value:`${d.online_minutes||0} daqiqa`,inline:true},
        {name:'📋 Reportlar',value:`${d.reports_checked||0}`,inline:true},
        {name:'📝 Shikoyatlar',value:`${d.complaints_closed||0}`,inline:true},
        {name:'⚖️ Jazolar',value:`${d.punishments_given||0}`,inline:true},
      ).setFooter({text:today()})
    await message.reply({ embeds:[embed] })
    return
  }

  if (cmd === 'myactive7') {
    const [r] = await sitePool.query(
      'SELECT SUM(online_minutes) as mins,SUM(reports_checked) as reports,SUM(complaints_closed) as complaints,SUM(punishments_given) as punishments FROM admin_activity WHERE player_name=? AND date>=DATE_SUB(CURDATE(),INTERVAL 7 DAY)',
      [playerInfo.name]
    )
    const d=r[0]||{}
    const embed = new EmbedBuilder().setColor('#7C3AED').setTitle(`📊 ${playerInfo.name} — Haftalik Faollik`)
      .addFields(
        {name:'⏱️ Jami online',value:`${d.mins||0} daqiqa`,inline:true},
        {name:'📋 Reportlar',value:`${d.reports||0}`,inline:true},
        {name:'📝 Shikoyatlar',value:`${d.complaints||0}`,inline:true},
        {name:'⚖️ Jazolar',value:`${d.punishments||0}`,inline:true},
      ).setFooter({text:'Oxirgi 7 kun'})
    await message.reply({ embeds:[embed] })
    return
  }

  if (cmd === 'mycomplaints' || cmd === 'mycomplaintsday') {
    const [r] = await sitePool.query("SELECT COUNT(*) as cnt FROM complaints WHERE closed_by=? AND DATE(updated_at)=CURDATE()", [playerInfo.name])
    await message.reply(`📝 **${playerInfo.name}** bugun **${r[0].cnt}** ta shikoyat yopdi!`)
    return
  }

  if (cmd === 'mycomplaints7') {
    const [r] = await sitePool.query("SELECT COUNT(*) as cnt FROM complaints WHERE closed_by=? AND updated_at>=DATE_SUB(NOW(),INTERVAL 7 DAY)", [playerInfo.name])
    await message.reply(`📝 **${playerInfo.name}** haftalik **${r[0].cnt}** ta shikoyat yopdi!`)
    return
  }

  if (cmd === 'admins' || cmd === 'adminonline') {
    const [admins] = await gamePool.query('SELECT name,admin,online,totalhour FROM accounts WHERE admin>0 ORDER BY admin DESC LIMIT 20')
    const embed = new EmbedBuilder().setColor('#9D4EDD').setTitle('🛡️ Adminlar ro\'yxati')
    let desc = ''
    for (const a of admins) {
      const dc = await sitePool.query('SELECT dc_user_id FROM admin_dc_users WHERE player_name=?', [a.name]).then(([r])=>r[0])
      const mention = dc?.dc_user_id?`<@${dc.dc_user_id}>`:''
      desc += `${a.online==1?'🟢':'⚫'} **${a.name}** (${adminLvl[a.admin]||'Admin'}) ${mention}\n`
    }
    embed.setDescription(desc||"Admin yo'q")
    await message.reply({ embeds:[embed] })
    return
  }

  if (cmd === 'banlist') {
    const [bans] = await gamePool.query('SELECT player,admin,reason FROM ban_list ORDER BY id DESC LIMIT 10').catch(()=>[[]])
    const embed = new EmbedBuilder().setColor('#EF4444').setTitle('⛔ Ban Ro\'yxati (Oxirgi 10)')
    if (!bans.length) embed.setDescription("Ban yo'q")
    else embed.setDescription(bans.map(b=>`• **${b.player}** — ${b.reason||'?'} (${b.admin})`).join('\n'))
    await message.reply({ embeds:[embed] })
    return
  }

  if (cmd === 'postnews') {
    if (!isOwner && playerInfo.admin < 5) { await message.reply('❌ Faqat Owner/Co-Owner!'); return }
    const title = args[1]||'Yangilik'
    const text = args.slice(2).join(' ')
    if (!text) { await message.reply('❌ `/postnews <sarlavha> <matn>`'); return }
    const ch = await client.channels.fetch(CH_SERVER_NEWS).catch(()=>null)
    if (!ch) { await message.reply('❌ Kanal topilmadi!'); return }
    const embed = new EmbedBuilder().setColor('#7C3AED').setTitle(`📰 ${title}`).setDescription(text).setTimestamp().setFooter({text:`Shadows RP | ${playerInfo.name}`})
    await ch.send({ embeds:[embed] })
    await message.reply('✅ Yangilik yuborildi!')
    return
  }

  // ─── BAN ───
  if (cmd === 'ban') {
    const nick=args[1], dur=args[2], reason=args.slice(3).join(' ')
    if (!nick||!reason) { await message.reply('❌ `/ban <nick> <vaqt> <sabab>`'); return }
    const target = await getPlayer(nick)
    if (!target) { await message.reply('❌ Oyinchi topilmadi!'); return }
    if (target.admin >= playerInfo.admin) { await message.reply('❌ Bu oyinchiga jazo bera olmaysiz!'); return }
    await gamePool.query("INSERT INTO ban_list(player,admin,reason,date) VALUES(?,?,?,NOW()) ON DUPLICATE KEY UPDATE reason=?,admin=?",
      [nick,playerInfo.name,reason,reason,playerInfo.name]).catch(()=>{})
    await logPunishment(playerInfo.name, nick, 'BAN', reason, dur||'Permanent', client)
    await message.reply(`⛔ **${nick}** banland! Sabab: ${reason} | Vaqt: ${dur||'Permanent'}`)
    return
  }

  if (cmd === 'unban') {
    const nick=args[1]; if (!nick) { await message.reply('❌ `/unban <nick>`'); return }
    await gamePool.query("DELETE FROM ban_list WHERE player=?", [nick]).catch(()=>{})
    await logPunishment(playerInfo.name, nick, 'UNBAN', 'Bekor qilindi', null, client)
    await message.reply(`✅ **${nick}** ban bekor qilindi!`)
    return
  }

  if (cmd === 'kick') {
    const nick=args[1], reason=args.slice(2).join(' ')||'Qoidabuzarlik'
    if (!nick) { await message.reply('❌ `/kick <nick> <sabab>`'); return }
    const target = await getPlayer(nick)
    if (!target) { await message.reply('❌ Oyinchi topilmadi!'); return }
    await logPunishment(playerInfo.name, nick, 'KICK', reason, null, client)
    await message.reply(`👢 **${nick}** kicklandi! Sabab: ${reason}`)
    return
  }

  if (cmd === 'warn') {
    const nick=args[1], reason=args.slice(2).join(' ')
    if (!nick||!reason) { await message.reply('❌ `/warn <nick> <sabab>`'); return }
    const target = await getPlayer(nick)
    if (!target) { await message.reply('❌ Oyinchi topilmadi!'); return }
    const newWarn=(target.warn||0)+1
    await gamePool.query('UPDATE accounts SET warn=? WHERE name=?', [newWarn, nick])
    await logPunishment(playerInfo.name, nick, 'WARN', reason, null, client)
    await message.reply(`⚠️ **${nick}** warn oldi! (${newWarn}/3) Sabab: ${reason}`)
    return
  }

  if (cmd === 'unwarn') {
    const nick=args[1]; if (!nick) { await message.reply('❌ `/unwarn <nick>`'); return }
    await gamePool.query('UPDATE accounts SET warn=GREATEST(0,warn-1) WHERE name=?', [nick])
    await logPunishment(playerInfo.name, nick, 'UNWARN', '1 warn olindi', null, client)
    await message.reply(`✅ **${nick}** dan 1 warn olindi!`)
    return
  }

  if (cmd === 'mute') {
    const nick=args[1], dur=parseInt(args[2])||30, reason=args.slice(3).join(' ')||'Qoidabuzarlik'
    if (!nick) { await message.reply('❌ `/mute <nick> <daqiqa> <sabab>`'); return }
    await gamePool.query('UPDATE accounts SET mute=? WHERE name=?', [dur, nick])
    await logPunishment(playerInfo.name, nick, 'MUTE', reason, `${dur} daqiqa`, client)
    await message.reply(`🔇 **${nick}** ${dur} daqiqa mute oldi! Sabab: ${reason}`)
    return
  }

  if (cmd === 'unmute') {
    const nick=args[1]; if (!nick) { await message.reply('❌ `/unmute <nick>`'); return }
    await gamePool.query('UPDATE accounts SET mute=0 WHERE name=?', [nick])
    await logPunishment(playerInfo.name, nick, 'UNMUTE', 'Bekor qilindi', null, client)
    await message.reply(`🔊 **${nick}** mute bekor qilindi!`)
    return
  }

  if (cmd === 'jail') {
    const nick=args[1], dur=parseInt(args[2])||30, reason=args.slice(3).join(' ')||'Qoidabuzarlik'
    if (!nick) { await message.reply('❌ `/jail <nick> <daqiqa> <sabab>`'); return }
    await gamePool.query('UPDATE accounts SET jail=? WHERE name=?', [dur, nick])
    await logPunishment(playerInfo.name, nick, 'JAIL', reason, `${dur} daqiqa`, client)
    await message.reply(`🔒 **${nick}** ${dur} daqiqa qamoqqa tushdi! Sabab: ${reason}`)
    return
  }

  if (cmd === 'unjail') {
    const nick=args[1]; if (!nick) { await message.reply('❌ `/unjail <nick>`'); return }
    await gamePool.query('UPDATE accounts SET jail=0 WHERE name=?', [nick])
    await logPunishment(playerInfo.name, nick, 'UNJAIL', 'Bekor qilindi', null, client)
    await message.reply(`🔓 **${nick}** qamoqdan chiqarildi!`)
    return
  }

  if (cmd === 'pul') {
    if (playerInfo.admin < 3) { await message.reply('❌ Min Admin 3 kerak!'); return }
    const nick=args[1], amount=parseInt(args[2])
    if (!nick||!amount) { await message.reply('❌ `/pul <nick> <miqdor>`'); return }
    await gamePool.query('UPDATE accounts SET money=money+? WHERE name=?', [amount, nick])
    await sitePool.query('INSERT INTO admin_logs(admin_name,action,details) VALUES(?,?,?)', [playerInfo.name,'Pul berish',`${nick} ga $${fmt(amount)}`])
    await message.reply(`💰 **${nick}** ga **$${fmt(amount)}** berildi!`)
    return
  }

  if (cmd === 'olpul') {
    if (playerInfo.admin < 3) { await message.reply('❌ Min Admin 3 kerak!'); return }
    const nick=args[1], amount=parseInt(args[2])
    if (!nick||!amount) { await message.reply('❌ `/olpul <nick> <miqdor>`'); return }
    await gamePool.query('UPDATE accounts SET money=GREATEST(0,money-?) WHERE name=?', [amount, nick])
    await sitePool.query('INSERT INTO admin_logs(admin_name,action,details) VALUES(?,?,?)', [playerInfo.name,'Pul olish',`${nick} dan $${fmt(amount)}`])
    await message.reply(`💸 **${nick}** dan **$${fmt(amount)}** olindi!`)
    return
  }

  if (cmd === 'setlevel') {
    if (playerInfo.admin < 4) { await message.reply('❌ Min Admin 4 kerak!'); return }
    const nick=args[1], level=parseInt(args[2])
    if (!nick||!level) { await message.reply('❌ `/setlevel <nick> <daraja>`'); return }
    await gamePool.query('UPDATE accounts SET level=? WHERE name=?', [Math.min(Math.max(level,1),100), nick])
    await sitePool.query('INSERT INTO admin_logs(admin_name,action,details) VALUES(?,?,?)', [playerInfo.name,'Daraja',`${nick} → ${level}`])
    await message.reply(`⭐ **${nick}** darajasi **${level}** ga o'zgartirildi!`)
    return
  }

  if (cmd === 'hp') {
    const nick=args[1], hp=parseInt(args[2])||100
    if (!nick) { await message.reply('❌ `/hp <nick> <miqdor>`'); return }
    await gamePool.query('UPDATE accounts SET health=? WHERE name=?', [Math.min(hp,100), nick])
    await message.reply(`💊 **${nick}** HP **${Math.min(hp,100)}** ga o'rnatildi!`)
    return
  }

  if (cmd === 'heal') {
    const nick=args[1]; if (!nick) { await message.reply('❌ `/heal <nick>`'); return }
    await gamePool.query('UPDATE accounts SET health=100 WHERE name=?', [nick])
    await message.reply(`💊 **${nick}** to'liq davolandi!`)
    return
  }

  // Noto'g'ri buyruq
  await message.react(client.emojis.cache.get(EMOJI_REJECT)||'❌').catch(()=>{})
  await message.reply({ content:`Bu buyruq qabul qilinmadi, xatolikni tuzatib qayta yuboring`, allowedMentions:{repliedUser:false} })
})

// ═══ START ═══
async function start() {
  await initDB()
  await client.login(TOKEN)
}

start().catch(e => { console.error('Bot xatosi:', e.message); process.exit(1) })
