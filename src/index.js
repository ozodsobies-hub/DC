require('dotenv').config()
const { Client, GatewayIntentBits, Partials, EmbedBuilder, REST, Routes, SlashCommandBuilder } = require('discord.js')
const mysql = require('mysql2/promise')
const { GoogleGenerativeAI } = require('@google/generative-ai')
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

// ═══ EMOJI ═══
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
  money_take: '<:moneytake:1523288239333576724>',
  money_give: '<:moneygive:1523288239333576724>',
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
  host: process.env.SITE_DB_HOST || 'zephyr.proxy.rlwy.net',
  port: parseInt(process.env.SITE_DB_PORT || '35377'),
  user: process.env.SITE_DB_USER || 'root',
  password: process.env.SITE_DB_PASS || 'HQMqKjcxPaoAXsaqNdrMRhcFRzPusZhj',
  database: process.env.SITE_DB_NAME || 'railway',
  waitForConnections:true, connectionLimit:5, connectTimeout:20000
}

let gamePool, sitePool
const pendingVerify = new Map()
const pendingRegister = new Map()

async function initDB() {
  try { gamePool = mysql.createPool(GAME_DB); await gamePool.query('SELECT 1'); console.log('✅ Game DB ulandi!') }
  catch(e) { console.error('❌ Game DB:', e.message) }
  for (let i = 0; i < 3; i++) {
    try {
      sitePool = mysql.createPool(SITE_DB); await sitePool.query('SELECT 1')
      console.log('✅ Site DB ulandi!'); await createTables(); return
    } catch(e) { console.error(`❌ Site DB ${i+1}:`, e.message); await new Promise(r=>setTimeout(r,3000)) }
  }
  console.error('❌ Site DB ulanmadi!')
}

async function createTables() {
  const tables = [
    `CREATE TABLE IF NOT EXISTS admin_dc_users (id INT AUTO_INCREMENT PRIMARY KEY, player_name VARCHAR(64) NOT NULL UNIQUE, dc_user_id VARCHAR(64) UNIQUE, dc_username VARCHAR(64), is_verified TINYINT DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS admin_activity (id INT AUTO_INCREMENT PRIMARY KEY, player_name VARCHAR(64) NOT NULL, online_minutes INT DEFAULT 0, reports_checked INT DEFAULT 0, complaints_closed INT DEFAULT 0, punishments_given INT DEFAULT 0, date DATE NOT NULL, UNIQUE KEY dp (player_name, date)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS muted_dc_users (id INT AUTO_INCREMENT PRIMARY KEY, dc_user_id VARCHAR(64) NOT NULL UNIQUE, muted_until DATETIME NOT NULL, reason TEXT) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS punishment_logs (id INT AUTO_INCREMENT PRIMARY KEY, admin_nick VARCHAR(64), player_nick VARCHAR(64), type VARCHAR(32), reason TEXT, duration VARCHAR(32), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  ]
  for (const sql of tables) await sitePool.query(sql).catch(()=>{})
  // ALTER lar
  await sitePool.query('ALTER TABLE admin_dc_users ADD COLUMN IF NOT EXISTS is_verified TINYINT DEFAULT 0').catch(()=>{})
  await sitePool.query('ALTER TABLE news ADD COLUMN IF NOT EXISTS video_url VARCHAR(500)').catch(()=>{})
  await sitePool.query('ALTER TABLE news ADD COLUMN IF NOT EXISTS pinned TINYINT DEFAULT 0').catch(()=>{})
  await sitePool.query('ALTER TABLE admin_logs ADD COLUMN IF NOT EXISTS details TEXT').catch(()=>{})
  console.log('✅ Jadvallar tayyor!')
}

// ═══ HELPERS ═══
const fmt = v => Number(v||0).toLocaleString('ru-RU')
const today = () => new Date().toISOString().split('T')[0]
const teamNames = {0:'Fuqaro',1:'Politsiya',2:'Tibbiyot',3:'Armiya',4:'SWAT',5:'FIB',6:'Sheriff',7:"Yong'inchi",8:'Mehnat',9:"Yo'l xizmati"}
const adminLvl = {0:"O'yinchi",1:'Yangi Admin',2:'Admin',3:'Senior Admin',4:'Bosh Admin',5:'Co-Owner',6:'Super Admin',13:'Owner'}

function getMedal(i) {
  if (i===0) return E.top1
  if (i<=2) return E.top2
  if (i<=5) return E.top2
  return E.top3
}

function parseEmojis(text) {
  return text.replace(/\{(\d+)\}/g, (_,id)=>`<:e${id}:${id}>`)
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

async function sendGameCommand(cmd) {
  if (!sitePool) return false
  try {
    await sitePool.query("INSERT INTO settings(setting_key,setting_value) VALUES('dc_game_command',?) ON DUPLICATE KEY UPDATE setting_value=?",[cmd,cmd])
    return true
  } catch { return false }
}

async function logPunishment(adminNick, playerNick, type, reason, duration, client) {
  try {
    const ch = await client.channels.fetch(CH_PUNISHMENTS).catch(()=>null)
    if (!ch) return
    let adminMention = `**${adminNick}**`
    if (sitePool) {
      const [dc] = await sitePool.query('SELECT dc_user_id FROM admin_dc_users WHERE player_name=? AND is_verified=1',[adminNick]).catch(()=>[[]])
      if (dc[0]?.dc_user_id) adminMention = `<@${dc[0].dc_user_id}>`
    }
    const typeE = {BAN:E.ban,UNBAN:E.unban,KICK:E.kick,MUTE:E.mute,UNMUTE:E.unmute,WARN:E.warn,UNWARN:E.ok,JAIL:E.jail,UNJAIL:E.unjail,OFFJAIL:E.jail,OFFBAN:E.ban,OFFMUTE:E.mute,OFFWARN:E.warn,OFFUNJAIL:E.unjail}
    const typeColor = {BAN:0xEF4444,KICK:0xF59E0B,MUTE:0x9D4EDD,WARN:0xF59E0B,JAIL:0xEF4444,OFFJAIL:0xEF4444,OFFBAN:0xEF4444,OFFMUTE:0x9D4EDD}
    const embed = new EmbedBuilder()
      .setColor(typeColor[type]||0x9D4EDD)
      .setTitle(`${typeE[type]||'⚖️'} ${type} — ${playerNick}`)
      .addFields(
        {name:`${E.admin} Admin`,value:adminMention,inline:true},
        {name:`${E.profil} Oyinchi`,value:`**${playerNick}**`,inline:true},
        {name:'📋 Sabab',value:reason||"Ko'rsatilmagan"},
        ...(duration?[{name:'⏱️ Vaqt',value:duration,inline:true}]:[])
      ).setTimestamp()
    await ch.send({embeds:[embed]})
    if (sitePool) {
      await sitePool.query('INSERT INTO punishment_logs(admin_nick,player_nick,type,reason,duration) VALUES(?,?,?,?,?)',[adminNick,playerNick,type,reason,duration||null]).catch(()=>{})
      await sitePool.query('INSERT INTO admin_activity(player_name,date,punishments_given) VALUES(?,?,1) ON DUPLICATE KEY UPDATE punishments_given=punishments_given+1',[adminNick,today()]).catch(()=>{})
    }
  } catch(e) { console.error('Log xato:', e.message) }
}

// ═══ SLASH COMMANDS ═══
const commands = [
  // Hammaga
  new SlashCommandBuilder().setName('start').setDescription('Barcha buyruqlar'),
  new SlashCommandBuilder().setName('help').setDescription('Yordam'),
  new SlashCommandBuilder().setName('myid').setDescription('Discord ID'),
  new SlashCommandBuilder().setName('setdc').setDescription('Akkaunt bog\'lash').addStringOption(o=>o.setName('nick').setDescription('O\'yindagi nick').setRequired(true)),
  new SlashCommandBuilder().setName('register').setDescription('Yangi akkaunt ro\'yxatdan o\'tish').addStringOption(o=>o.setName('nick').setDescription('Nick (Ism_Familiya)').setRequired(true)).addStringOption(o=>o.setName('email').setDescription('Email').setRequired(false)),
  new SlashCommandBuilder().setName('profil').setDescription('O\'z profilingiz'),
  new SlashCommandBuilder().setName('online').setDescription('Onlayn o\'yinchilar'),
  new SlashCommandBuilder().setName('server').setDescription('Server ma\'lumoti'),
  new SlashCommandBuilder().setName('mypul').setDescription('Mening puliim'),
  new SlashCommandBuilder().setName('transfer').setDescription('Pul o\'tkazish').addStringOption(o=>o.setName('nick').setDescription('Qabul qiluvchi').setRequired(true)).addIntegerOption(o=>o.setName('miqdor').setDescription('Miqdor').setRequired(true)),
  // Top
  new SlashCommandBuilder().setName('top').setDescription('Reyting').addStringOption(o=>o.setName('tur').setDescription('level/money/score/hours').setRequired(false)),
  new SlashCommandBuilder().setName('toplevel').setDescription('Daraja reytingi'),
  new SlashCommandBuilder().setName('topmoney').setDescription('Boylik reytingi'),
  new SlashCommandBuilder().setName('topscore').setDescription('Score reytingi'),
  new SlashCommandBuilder().setName('tophours').setDescription('Vaqt reytingi'),
  // Admin
  new SlashCommandBuilder().setName('admins').setDescription('Adminlar [5+]'),
  new SlashCommandBuilder().setName('banlist').setDescription('Ban ro\'yxati [1+]'),
  new SlashCommandBuilder().setName('ban').setDescription('Ban [1+]').addStringOption(o=>o.setName('nick').setDescription('Nick yoki ID').setRequired(true)).addStringOption(o=>o.setName('vaqt').setDescription('Vaqt').setRequired(true)).addStringOption(o=>o.setName('sabab').setDescription('Sabab').setRequired(true)),
  new SlashCommandBuilder().setName('unban').setDescription('Unban [1+]').addStringOption(o=>o.setName('nick').setDescription('Nick').setRequired(true)),
  new SlashCommandBuilder().setName('mute').setDescription('Mute [1+]').addStringOption(o=>o.setName('nick').setDescription('Nick').setRequired(true)).addIntegerOption(o=>o.setName('daqiqa').setDescription('Daqiqa').setRequired(true)).addStringOption(o=>o.setName('sabab').setDescription('Sabab').setRequired(true)),
  new SlashCommandBuilder().setName('unmute').setDescription('Unmute [1+]').addStringOption(o=>o.setName('nick').setDescription('Nick').setRequired(true)),
  new SlashCommandBuilder().setName('warn').setDescription('Warn [1+]').addStringOption(o=>o.setName('nick').setDescription('Nick').setRequired(true)).addStringOption(o=>o.setName('sabab').setDescription('Sabab').setRequired(true)),
  new SlashCommandBuilder().setName('unwarn').setDescription('Unwarn [1+]').addStringOption(o=>o.setName('nick').setDescription('Nick').setRequired(true)),
  new SlashCommandBuilder().setName('kick').setDescription('Kick [1+]').addStringOption(o=>o.setName('nick').setDescription('Nick').setRequired(true)).addStringOption(o=>o.setName('sabab').setDescription('Sabab').setRequired(true)),
  new SlashCommandBuilder().setName('jail').setDescription('Jail [1+]').addStringOption(o=>o.setName('nick').setDescription('Nick').setRequired(true)).addIntegerOption(o=>o.setName('daqiqa').setDescription('Daqiqa').setRequired(true)).addStringOption(o=>o.setName('sabab').setDescription('Sabab').setRequired(true)),
  new SlashCommandBuilder().setName('unjail').setDescription('Unjail [1+]').addStringOption(o=>o.setName('nick').setDescription('Nick').setRequired(true)),
  // Offline
  new SlashCommandBuilder().setName('offban').setDescription('Offline Ban [1+]').addStringOption(o=>o.setName('nick').setDescription('Nick').setRequired(true)).addStringOption(o=>o.setName('sabab').setDescription('Sabab').setRequired(true)),
  new SlashCommandBuilder().setName('offmute').setDescription('Offline Mute [1+]').addStringOption(o=>o.setName('nick').setDescription('Nick').setRequired(true)).addIntegerOption(o=>o.setName('daqiqa').setDescription('Daqiqa').setRequired(true)).addStringOption(o=>o.setName('sabab').setDescription('Sabab').setRequired(true)),
  new SlashCommandBuilder().setName('offwarn').setDescription('Offline Warn [1+]').addStringOption(o=>o.setName('nick').setDescription('Nick').setRequired(true)).addStringOption(o=>o.setName('sabab').setDescription('Sabab').setRequired(true)),
  new SlashCommandBuilder().setName('offjail').setDescription('Offline Jail [1+]').addStringOption(o=>o.setName('nick').setDescription('Nick').setRequired(true)).addIntegerOption(o=>o.setName('daqiqa').setDescription('Daqiqa').setRequired(true)).addStringOption(o=>o.setName('sabab').setDescription('Sabab').setRequired(true)),
  new SlashCommandBuilder().setName('offunjail').setDescription('Offline Unjail [1+]').addStringOption(o=>o.setName('nick').setDescription('Nick').setRequired(true)),
  // Admin 5+
  new SlashCommandBuilder().setName('pul').setDescription('Pul berish [5+]').addStringOption(o=>o.setName('nick').setDescription('Nick').setRequired(true)).addIntegerOption(o=>o.setName('miqdor').setDescription('Miqdor').setRequired(true)),
  new SlashCommandBuilder().setName('olpul').setDescription('Pul olish [5+]').addStringOption(o=>o.setName('nick').setDescription('Nick').setRequired(true)).addIntegerOption(o=>o.setName('miqdor').setDescription('Miqdor').setRequired(true)),
  new SlashCommandBuilder().setName('setlevel').setDescription('Daraja [5+]').addStringOption(o=>o.setName('nick').setDescription('Nick').setRequired(true)).addIntegerOption(o=>o.setName('daraja').setDescription('Daraja').setRequired(true)),
  new SlashCommandBuilder().setName('hp').setDescription('HP [1+]').addStringOption(o=>o.setName('nick').setDescription('Nick').setRequired(true)).addIntegerOption(o=>o.setName('miqdor').setDescription('Miqdor').setRequired(true)),
  new SlashCommandBuilder().setName('heal').setDescription('Davolash [1+]').addStringOption(o=>o.setName('nick').setDescription('Nick').setRequired(true)),
  new SlashCommandBuilder().setName('sendall').setDescription('Hammaga xabar [5+]').addStringOption(o=>o.setName('matn').setDescription('Xabar matni').setRequired(true)),
  // Aktivlik
  new SlashCommandBuilder().setName('myactive').setDescription('Mening aktivligim').addStringOption(o=>o.setName('davr').setDescription('today/week').setRequired(false)),
  new SlashCommandBuilder().setName('active').setDescription('Oyinchi aktivligi [5+]').addStringOption(o=>o.setName('nick').setDescription('Nick').setRequired(true)).addStringOption(o=>o.setName('davr').setDescription('today/week').setRequired(false)),
  new SlashCommandBuilder().setName('activeall').setDescription('Barcha aktivlik [5+]').addStringOption(o=>o.setName('davr').setDescription('today/week').setRequired(false)),
  new SlashCommandBuilder().setName('topactive').setDescription('Top aktiv adminlar [5+]'),
  new SlashCommandBuilder().setName('report').setDescription('Report statistika [5+]').addStringOption(o=>o.setName('nick').setDescription('Nick').setRequired(true)),
  new SlashCommandBuilder().setName('reportall').setDescription('Barcha reportlar [5+]'),
  new SlashCommandBuilder().setName('topreport').setDescription('Top report adminlar [5+]'),
  // Yangilik
  new SlashCommandBuilder().setName('postnews').setDescription('Yangilik [5+]').addStringOption(o=>o.setName('joy').setDescription('admin/server').setRequired(true)).addStringOption(o=>o.setName('sarlavha').setDescription('Sarlavha').setRequired(true)).addStringOption(o=>o.setName('matn').setDescription('Matn (emoji: {ID})').setRequired(true)).addStringOption(o=>o.setName('rasm').setDescription('Rasm URL').setRequired(false)),
  // Fraksiya
  new SlashCommandBuilder().setName('fraksiya').setDescription('Fraksiya [Lider/5+]').addIntegerOption(o=>o.setName('id').setDescription('Fraksiya ID (1-9)').setRequired(true)),
  new SlashCommandBuilder().setName('setrank').setDescription('Rank [Lider/5+]').addStringOption(o=>o.setName('nick').setDescription('Nick').setRequired(true)).addIntegerOption(o=>o.setName('rank').setDescription('Rank').setRequired(true)),
].map(c=>c.toJSON())

async function registerSlashCommands() {
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
  await registerSlashCommands()
  for (const gid of [GUILD_MAIN,GUILD_ADMIN]) {
    try {
      const guild = await client.guilds.fetch(gid)
      const members = await guild.members.fetch()
      const role = guild.roles.cache.get(ROLE_MEMBER)
      if (role) for (const [,m] of members) if (!m.roles.cache.has(ROLE_MEMBER)&&!m.user.bot) await m.roles.add(role).catch(()=>{})
    } catch {}
  }
})

client.on('guildMemberAdd', async member => {
  try { const role = member.guild.roles.cache.get(ROLE_MEMBER); if (role) await member.roles.add(role) } catch {}
})

// ═══ DM HANDLER - Parol tekshiruvi ═══
client.on('messageCreate', async message => {
  if (message.author.bot) return
  if (message.guild) return // Faqat DM

  // SETDC verify
  if (pendingVerify.has(message.author.id)) {
    const pending = pendingVerify.get(message.author.id)
    if (Date.now() - pending.time > 5*60*1000) {
      pendingVerify.delete(message.author.id)
      await message.reply(`${E.reject} Vaqt tugadi! Qaytadan \`/setdc\` yozing.`)
      return
    }
    const password = message.content.trim()
    try {
      const p = await getPlayer(pending.nick)
      if (!p) { await message.reply(`${E.notfound} Oyinchi topilmadi!`); pendingVerify.delete(message.author.id); return }
      const hashed = crypto.createHash('sha256').update(password+p.salt).digest('hex').toUpperCase()
      if (hashed !== p.password) {
        await message.reply(`${E.reject} Parol noto'g'ri! Qaytadan \`/setdc\` yozing.`)
        pendingVerify.delete(message.author.id); return
      }
      if (sitePool) {
        await sitePool.query('INSERT INTO admin_dc_users(player_name,dc_user_id,dc_username,is_verified) VALUES(?,?,?,1) ON DUPLICATE KEY UPDATE dc_user_id=?,dc_username=?,is_verified=1',
          [p.name,message.author.id,message.author.username,message.author.id,message.author.username])
      }
      await message.reply(`${E.ok} **${p.name}** akkauntingiz muvaffaqiyatli bog'landi!\nAdmin bo'lsangiz — \`/start\` yozing.`)
      pendingVerify.delete(message.author.id)
    } catch(e) { await message.reply(`${E.reject} Xato: ${e.message}`); pendingVerify.delete(message.author.id) }
    return
  }

  // REGISTER verify
  if (pendingRegister.has(message.author.id)) {
    const pending = pendingRegister.get(message.author.id)
    if (Date.now() - pending.time > 5*60*1000) {
      pendingRegister.delete(message.author.id)
      await message.reply(`${E.reject} Vaqt tugadi!`)
      return
    }
    if (pending.step === 'password') {
      pending.password = message.content.trim()
      if (pending.password.length < 6) { await message.reply(`${E.reject} Parol kamida 6 belgi bo'lishi kerak!`); return }
      pending.step = 'confirm'
      pendingRegister.set(message.author.id, pending)
      await message.reply('🔐 Parolni tasdiqlang (qayta yozing):')
      return
    }
    if (pending.step === 'confirm') {
      if (message.content.trim() !== pending.password) {
        await message.reply(`${E.reject} Parollar mos kelmadi! Qaytadan yozing:`)
        pending.step = 'password'
        pendingRegister.set(message.author.id, pending)
        return
      }
      // Akkaunt yaratish
      try {
        const salt = crypto.randomBytes(16).toString('hex')
        const hashed = crypto.createHash('sha256').update(pending.password+salt).digest('hex').toUpperCase()
        await gamePool.query(
          'INSERT INTO accounts(name,password,salt,email,reg_time,last_login) VALUES(?,?,?,?,UNIX_TIMESTAMP(),UNIX_TIMESTAMP())',
          [pending.nick,hashed,salt,pending.email||'']
        )
        if (sitePool) {
          await sitePool.query('INSERT INTO admin_dc_users(player_name,dc_user_id,dc_username,is_verified) VALUES(?,?,?,1) ON DUPLICATE KEY UPDATE dc_user_id=?,dc_username=?,is_verified=1',
            [pending.nick,message.author.id,message.author.username,message.author.id,message.author.username])
        }
        await message.reply(`${E.ok} **${pending.nick}** akkaunt yaratildi va Discord ga bog'landi!\n\n🎮 Saytga kirish: Nick: \`${pending.nick}\`, Parol: **(siz bilasiz)**\nO'yinga kiring va ro'yxatdan o'tishni tugatting!`)
        pendingRegister.delete(message.author.id)
      } catch(e) {
        if (e.code === 'ER_DUP_ENTRY') await message.reply(`${E.reject} Bu nick allaqachon mavjud!`)
        else await message.reply(`${E.reject} Xato: ${e.message}`)
        pendingRegister.delete(message.author.id)
      }
      return
    }
  }
})

// ═══ SLASH COMMAND HANDLER ═══
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return
  await interaction.deferReply({ephemeral: ['start','help','myid','profil','mypul'].includes(interaction.commandName)}).catch(()=>{})

  const cmd = interaction.commandName
  const dcUser = await getDcUser(interaction.user.id)
  const playerInfo = dcUser ? await getPlayer(dcUser.player_name) : null
  const adminLevel = playerInfo ? (parseInt(playerInfo.admin)||0) : 0
  const isAdmin = adminLevel >= 1

  const reply = async (content) => interaction.editReply({content}).catch(()=>{})
  const replyEmbed = async (embed) => interaction.editReply({embeds:[embed]}).catch(()=>{})

  // ─── MYID ───
  if (cmd === 'myid') {
    await reply(`${E.id} Sizning Discord ID: \`${interaction.user.id}\``)
    return
  }

  // ─── SETDC ───
  if (cmd === 'setdc') {
    const nick = interaction.options.getString('nick')
    if (!/^[A-Za-z]+_[A-Za-z]+$/.test(nick)) { await reply(`${E.reject} Format: Ism_Familiya`); return }
    const p = await getPlayer(nick)
    if (!p) { await reply(`${E.notfound} **${nick}** o'yinda topilmadi!`); return }
    pendingVerify.set(interaction.user.id, {nick:p.name, time:Date.now()})
    try {
      await interaction.user.send(`${E.id} **${p.name}** akkauntini bog'lash uchun o'yindagi parolingizni yozing:\n_(Xavfsizlik uchun faqat shu yerda!)_`)
      await reply(`${E.ok} DM ga parol so'rovi yuborildi! Shaxsiy xabarlaringizni tekshiring.`)
    } catch {
      await reply(`${E.reject} DM yuborib bo'lmadi! Discord sozlamalarida shaxsiy xabarlarni yoqing.`)
      pendingVerify.delete(interaction.user.id)
    }
    setTimeout(()=>pendingVerify.delete(interaction.user.id), 5*60*1000)
    return
  }

  // ─── REGISTER ───
  if (cmd === 'register') {
    const nick = interaction.options.getString('nick')
    const email = interaction.options.getString('email')||''
    if (!/^[A-Za-z]+_[A-Za-z]+$/.test(nick)) { await reply(`${E.reject} Nick format: Ism_Familiya (faqat lotin harflari)`); return }
    const exists = await getPlayer(nick)
    if (exists) { await reply(`${E.reject} **${nick}** nick allaqachon mavjud! Boshqa nick tanlang.`); return }
    pendingRegister.set(interaction.user.id, {nick, email, step:'password', time:Date.now()})
    try {
      await interaction.user.send(`${E.register} **${nick}** akkaunt yaratish uchun parol o'rnating:\n_(Kamida 6 belgi, faqat shu yerda yozing!)_`)
      await reply(`${E.ok} DM ga parol o'rnatish so'rovi yuborildi!`)
    } catch {
      await reply(`${E.reject} DM yuborib bo'lmadi! Shaxsiy xabarlarni yoqing.`)
      pendingRegister.delete(interaction.user.id)
    }
    return
  }

  // ─── START / HELP ───
  if (cmd === 'start' || cmd === 'help') {
    const embed = new EmbedBuilder().setColor('#7C3AED')
    if (isAdmin) {
      embed.setTitle(`${E.admin} Admin Buyruqlari — ${adminLvl[adminLevel]||'Admin'}`)
      .setDescription(`Salom **${playerInfo.name}**!`)
      .addFields(
        {name:`${E.profil} Profil`,value:'`/profil` `/online` `/top` `/server` `/mypul`',inline:false},
        {name:`${E.ban} Jazo [1+]`,value:'`/ban` `/unban` `/mute` `/unmute`\n`/warn` `/unwarn` `/kick` `/jail` `/unjail`',inline:false},
        {name:`${E.jail} Offline Jazo [1+]`,value:'`/offban` `/offmute` `/offwarn` `/offjail` `/offunjail`',inline:false},
        {name:'💊 Sog\'liq [1+]',value:'`/hp <nick> <miqdor>` `/heal <nick>`',inline:false},
        {name:`${E.active} Aktivlik`,value:'`/myactive [today/week]` `/active <nick>` `/activeall`\n`/topactive` `/report <nick>` `/reportall` `/topreport`',inline:false},
        {name:`${E.admin} Admin [5+]`,value:'`/admins` `/banlist` `/sendall <matn>`',inline:false},
        {name:`${E.money_give} Moliya [5+]`,value:'`/pul <nick> <miqdor>` `/olpul <nick> <miqdor>`',inline:false},
        {name:'⭐ Daraja [5+]',value:'`/setlevel <nick> <daraja>`',inline:false},
        {name:`${E.news} Yangilik [5+]`,value:'`/postnews <admin/server> <sarlavha> <matn> [rasm]`\nEmoji: `{ID}` formatida',inline:false},
        {name:`${E.fraksiya} Fraksiya [Lider/5+]`,value:'`/fraksiya <id>` `/setrank <nick> <rank>`',inline:false},
        {name:`${E.top1} Top`,value:'`/toplevel` `/topmoney` `/topscore` `/tophours`',inline:false},
      )
    } else {
      embed.setTitle(`${E.server} Shadows RP Buyruqlari`)
      .addFields(
        {name:`${E.profil} Profil`,value:'`/profil` — O\'z profilingiz\n`/top` — Reyting\n`/online` — Onlayn\n`/server` — Server info',inline:false},
        {name:`${E.transfer} Moliya`,value:'`/mypul` — Mening pulim\n`/transfer <nick> <miqdor>` — Pul o\'tkazish',inline:false},
        {name:`${E.register} Bog\'lanish`,value:'`/setdc <nick>` — Akkaunt bog\'lash\n`/register <nick>` — Yangi akkaunt\n`/myid` — Discord ID',inline:false},
      )
    }
    await replyEmbed(embed)
    return
  }

  // ─── PROFIL ───
  if (cmd === 'profil') {
    if (!dcUser) { await reply(`${E.reject} Avval \`/setdc\` bilan akkauntingizni bog'lang!`); return }
    const p = playerInfo; if (!p) return
    const embed = new EmbedBuilder()
      .setColor(p.online==1?0x10B981:0x6B6B8A)
      .setTitle(`${E.profil} ${p.name}`)
      .setDescription(`${teamNames[p.team]||'Fuqaro'} • Daraja ${p.level}`)
      .addFields(
        {name:`${E.money_give} Naqd`,value:`$${fmt(p.money)}`,inline:true},
        {name:'🏦 Bank',value:`$${fmt(p.bank)}`,inline:true},
        {name:'⭐ Score',value:`${p.score||0}`,inline:true},
        {name:'⏱️ Vaqt',value:`${p.totalhour||0}s`,inline:true},
        {name:`${E.admin} Admin`,value:adminLvl[parseInt(p.admin)]||"O'yinchi",inline:true},
        {name:`${E.warn} Warn`,value:`${p.warn||0}/3`,inline:true},
        {name:`${E.online} Holat`,value:p.online==1?'Onlayn':'Oflayn',inline:true},
        {name:'🏥 HP',value:`${p.health||100}/100`,inline:true},
        {name:'💎 Premium',value:p.premium==1?`${E.ok}`:`${E.reject}`,inline:true},
      )
    await replyEmbed(embed)
    return
  }

  // ─── ONLINE ───
  if (cmd === 'online') {
    const [players] = await gamePool.query('SELECT name,level,team,id FROM accounts WHERE online=1 ORDER BY level DESC LIMIT 30').catch(()=>[[]])
    const embed = new EmbedBuilder().setColor('#10B981').setTitle(`${E.online} Onlayn Oyinchilar (${players.length})`)
    embed.setDescription(players.length?players.map(p=>`• **${p.name}** (${p.id}) ${p.level}lvl — ${teamNames[p.team]||'Fuqaro'}`).join('\n').slice(0,2000):"Hech kim onlayn emas")
    await replyEmbed(embed)
    return
  }

  // ─── TOP lar ───
  const topTypes = {top:interaction.options?.getString?.('tur')||'level', toplevel:'level', topmoney:'money', topscore:'score', tophours:'totalhour'}
  if (topTypes[cmd] !== undefined) {
    const type = topTypes[cmd]
    const om = {level:'level',money:'money',score:'score',hours:'totalhour'}
    const order = om[type]||type
    const [players] = await gamePool.query(`SELECT name,level,money,score,totalhour,online,id FROM accounts ORDER BY ${order} DESC LIMIT 10`).catch(()=>[[]])
    const typeLabel = {level:'Daraja',money:'Boylik',score:'Score',totalhour:'Vaqt'}
    const embed = new EmbedBuilder().setColor('#F59E0B').setTitle(`${E.top1} Top 10 — ${typeLabel[order]||order}`)
    const desc = players.map((p,i)=>{
      const medal = i===0?E.top1:i<3?E.top2:E.top3
      const val = order==='money'?`$${fmt(p.money)}`:order==='totalhour'?`${p.totalhour||0}s`:order==='score'?`${p.score||0}pt`:`${p.level}lvl`
      return `${medal} **${p.name}** (${p.id}) — ${val} ${p.online==1?E.online:''}`
    }).join('\n')
    embed.setDescription(desc||"Yo'q")
    await replyEmbed(embed)
    return
  }

  // ─── SERVER ───
  if (cmd === 'server') {
    const [[{total}]] = await gamePool.query('SELECT COUNT(*) as total FROM accounts').catch(()=>[[{total:0}]])
    const [[{online}]] = await gamePool.query('SELECT COUNT(*) as online FROM accounts WHERE online=1').catch(()=>[[{online:0}]])
    const [[{admins}]] = await gamePool.query('SELECT COUNT(*) as admins FROM accounts WHERE admin>0').catch(()=>[[{admins:0}]])
    const embed = new EmbedBuilder().setColor('#7C3AED').setTitle(`${E.server} Shadows RP`)
      .addFields(
        {name:'🌐 IP',value:'play.shadowsrp.uz',inline:true},
        {name:`${E.online} Onlayn`,value:`${online}`,inline:true},
        {name:'👥 Jami',value:`${total}`,inline:true},
        {name:`${E.admin} Adminlar`,value:`${admins}`,inline:true},
      )
    await replyEmbed(embed)
    return
  }

  // ─── MYPUL ───
  if (cmd === 'mypul') {
    if (!dcUser) { await reply(`${E.reject} Avval \`/setdc\` bilan bog'lang!`); return }
    const p = playerInfo; if (!p) return
    await reply(`${E.money_give} **${p.name}**\nNaqd: **$${fmt(p.money)}**\nBank: **$${fmt(p.bank)}**\nDonat: **${p.donate_current||0} RUB**`)
    return
  }

  // ─── TRANSFER ───
  if (cmd === 'transfer') {
    if (!dcUser) { await reply(`${E.reject} Avval \`/setdc\` bilan bog'lang!`); return }
    const toNick = interaction.options.getString('nick')
    const amount = interaction.options.getInteger('miqdor')
    const from = playerInfo; if (!from) return
    const to = await getPlayer(toNick)
    if (!to) { await reply(`${E.notfound} **${toNick}** topilmadi!`); return }
    if (from.money < amount) { await reply(`${E.reject} Yetarli pul yo'q! Sizda: $${fmt(from.money)}`); return }
    if (amount > 10000000) { await reply(`${E.reject} Maksimal: $10,000,000`); return }
    if (from.name === to.name) { await reply(`${E.reject} O'zingizga o'tkaza olmaysiz!`); return }
    await gamePool.query('UPDATE accounts SET money=money-? WHERE name=?',[amount,from.name])
    await gamePool.query('UPDATE accounts SET money=money+? WHERE name=?',[amount,to.name])
    await reply(`${E.transfer} **$${fmt(amount)}** **${from.name}** → **${to.name}**`)
    return
  }

  // ════ ADMIN BUYRUQLAR ════
  if (!isAdmin) {
    await reply(`${E.reject} Bu buyruq faqat adminlar uchun! \`/setdc\` bilan bog'lang.`)
    return
  }

  // ─── ADMINS [5+] ───
  if (cmd === 'admins') {
    if (adminLevel < 5) { await reply(`${E.warn} Min Admin 5 kerak!`); return }
    const [admins] = await gamePool.query('SELECT name,admin,online,totalhour,id FROM accounts WHERE admin>0 ORDER BY admin DESC LIMIT 20').catch(()=>[[]])
    let desc = ''
    for (const a of admins) {
      let mention = ''
      if (sitePool) {
        const [dc] = await sitePool.query('SELECT dc_user_id FROM admin_dc_users WHERE player_name=? AND is_verified=1',[a.name]).catch(()=>[[]])
        if (dc[0]?.dc_user_id) mention = `<@${dc[0].dc_user_id}>`
      }
      desc += `${a.online==1?E.online:'⚫'} **${a.name}** (${a.id}) ${adminLvl[a.admin]||'Admin'} ${mention}\n`
    }
    const embed = new EmbedBuilder().setColor('#9D4EDD').setTitle(`${E.admin} Adminlar`).setDescription(desc||"Yo'q")
    await replyEmbed(embed)
    return
  }

  // ─── BANLIST ───
  if (cmd === 'banlist') {
    const [bans] = await gamePool.query('SELECT player,admin,reason FROM ban_list ORDER BY id DESC LIMIT 15').catch(()=>[[]])
    const embed = new EmbedBuilder().setColor('#EF4444').setTitle(`${E.ban} Ban Ro'yxati`)
    embed.setDescription(bans.length?bans.map((b,i)=>`**${i+1}.** ${b.player} — ${b.reason||'?'} (${b.admin})`).join('\n'):"Yo'q")
    await replyEmbed(embed)
    return
  }

  // ─── MYACTIVE ───
  if (cmd === 'myactive') {
    if (!sitePool) { await reply(`${E.reject} DB ulangmagan`); return }
    const davr = interaction.options.getString('davr')||'today'
    if (davr === 'week') {
      const [r] = await sitePool.query('SELECT SUM(online_minutes) as mins,SUM(reports_checked) as reports,SUM(complaints_closed) as complaints,SUM(punishments_given) as punishments FROM admin_activity WHERE player_name=? AND date>=DATE_SUB(CURDATE(),INTERVAL 7 DAY)',[playerInfo.name]).catch(()=>[[{}]])
      const d=r[0]||{}
      const embed = new EmbedBuilder().setColor('#7C3AED').setTitle(`${E.active} ${playerInfo.name} — Haftalik`)
        .addFields({name:'⏱️ Online',value:`${d.mins||0} daqiqa`,inline:true},{name:'📋 Report',value:`${d.reports||0}`,inline:true},{name:'📝 Shikoyat',value:`${d.complaints||0}`,inline:true},{name:'⚖️ Jazo',value:`${d.punishments||0}`,inline:true})
      await replyEmbed(embed)
    } else {
      const [r] = await sitePool.query('SELECT * FROM admin_activity WHERE player_name=? AND date=?',[playerInfo.name,today()]).catch(()=>[[]])
      const d=r[0]||{}
      const embed = new EmbedBuilder().setColor('#7C3AED').setTitle(`${E.active} ${playerInfo.name} — Bugun`)
        .addFields({name:'⏱️ Online',value:`${d.online_minutes||0} daqiqa`,inline:true},{name:'📋 Report',value:`${d.reports_checked||0}`,inline:true},{name:'📝 Shikoyat',value:`${d.complaints_closed||0}`,inline:true},{name:'⚖️ Jazo',value:`${d.punishments_given||0}`,inline:true})
        .setFooter({text:today()})
      await replyEmbed(embed)
    }
    return
  }

  // ─── ACTIVE [5+] ───
  if (cmd === 'active') {
    if (adminLevel < 5) { await reply(`${E.warn} Min Admin 5 kerak!`); return }
    if (!sitePool) { await reply(`${E.reject} DB ulangmagan`); return }
    const nick = interaction.options.getString('nick')
    const davr = interaction.options.getString('davr')||'today'
    const p = await getPlayer(nick)
    if (!p) { await reply(`${E.notfound} **${nick}** topilmadi!`); return }
    if (davr === 'week') {
      const [r] = await sitePool.query('SELECT SUM(online_minutes) as mins,SUM(reports_checked) as reports,SUM(complaints_closed) as complaints,SUM(punishments_given) as punishments FROM admin_activity WHERE player_name=? AND date>=DATE_SUB(CURDATE(),INTERVAL 7 DAY)',[nick]).catch(()=>[[{}]])
      const d=r[0]||{}
      const embed = new EmbedBuilder().setColor('#7C3AED').setTitle(`${E.active} ${nick} — Haftalik`)
        .addFields({name:'⏱️ Online',value:`${d.mins||0} daqiqa`,inline:true},{name:'📋 Report',value:`${d.reports||0}`,inline:true},{name:'📝 Shikoyat',value:`${d.complaints||0}`,inline:true},{name:'⚖️ Jazo',value:`${d.punishments||0}`,inline:true})
      await replyEmbed(embed)
    } else {
      const [r] = await sitePool.query('SELECT * FROM admin_activity WHERE player_name=? AND date=?',[nick,today()]).catch(()=>[[]])
      const d=r[0]||{}
      const embed = new EmbedBuilder().setColor('#7C3AED').setTitle(`${E.active} ${nick} — Bugun`)
        .addFields({name:'⏱️ Online',value:`${d.online_minutes||0} daqiqa`,inline:true},{name:'📋 Report',value:`${d.reports_checked||0}`,inline:true},{name:'📝 Shikoyat',value:`${d.complaints_closed||0}`,inline:true},{name:'⚖️ Jazo',value:`${d.punishments_given||0}`,inline:true})
      await replyEmbed(embed)
    }
    return
  }

  // ─── ACTIVEALL [5+] ───
  if (cmd === 'activeall') {
    if (adminLevel < 5) { await reply(`${E.warn} Min Admin 5 kerak!`); return }
    if (!sitePool) { await reply(`${E.reject} DB ulangmagan`); return }
    const davr = interaction.options.getString('davr')||'today'
    const where = davr==='week'?'AND date>=DATE_SUB(CURDATE(),INTERVAL 7 DAY)':'AND date=CURDATE()'
    const [rows] = await sitePool.query(`SELECT player_name,SUM(online_minutes) as mins,SUM(reports_checked) as reports,SUM(complaints_closed) as complaints,SUM(punishments_given) as punishments FROM admin_activity WHERE 1=1 ${where} GROUP BY player_name ORDER BY mins DESC LIMIT 20`).catch(()=>[[]])
    
    // Barcha adminlarni ham qo'shamiz (aktivligi bo'lmaganlarni ham)
    const [allAdmins] = await gamePool.query('SELECT name FROM accounts WHERE admin>0 ORDER BY admin DESC').catch(()=>[[]])
    const activeMap = {}
    rows.forEach(r => activeMap[r.player_name] = r)
    
    const embed = new EmbedBuilder().setColor('#7C3AED').setTitle(`${E.active} Barcha Adminlar — ${davr==='week'?'Haftalik':'Bugun'}`)
    const desc = allAdmins.map((a,i)=>{
      const d = activeMap[a.name]||{}
      return `**${i+1}.** **${a.name}** | ⏱️${d.mins||0}d | 📋${d.reports||0} | ⚖️${d.punishments||0}`
    }).join('\n')
    embed.setDescription(desc.slice(0,2000)||"Ma'lumot yo'q")
    await replyEmbed(embed)
    return
  }

  // ─── TOPACTIVE [5+] ───
  if (cmd === 'topactive') {
    if (adminLevel < 5) { await reply(`${E.warn} Min Admin 5 kerak!`); return }
    if (!sitePool) { await reply(`${E.reject} DB ulangmagan`); return }
    const [rows] = await sitePool.query('SELECT player_name,SUM(online_minutes) as mins FROM admin_activity WHERE date>=DATE_SUB(CURDATE(),INTERVAL 7 DAY) GROUP BY player_name ORDER BY mins DESC LIMIT 10').catch(()=>[[]])
    const embed = new EmbedBuilder().setColor('#F59E0B').setTitle(`${E.top1} Top Aktiv Adminlar (Haftalik)`)
    const desc = rows.map((r,i)=>`${i===0?E.top1:i<3?E.top2:E.top3} **${r.player_name}** — ${r.mins||0} daqiqa`).join('\n')
    embed.setDescription(desc||"Yo'q")
    await replyEmbed(embed)
    return
  }

  // ─── REPORT [5+] ───
  if (cmd === 'report') {
    if (adminLevel < 5) { await reply(`${E.warn} Min Admin 5 kerak!`); return }
    if (!sitePool) { await reply(`${E.reject} DB ulangmagan`); return }
    const nick = interaction.options.getString('nick')
    const [td] = await sitePool.query('SELECT reports_checked FROM admin_activity WHERE player_name=? AND date=?',[nick,today()]).catch(()=>[[]])
    const [wk] = await sitePool.query('SELECT SUM(reports_checked) as total FROM admin_activity WHERE player_name=? AND date>=DATE_SUB(CURDATE(),INTERVAL 7 DAY)',[nick]).catch(()=>[[{}]])
    const embed = new EmbedBuilder().setColor('#3B82F6').setTitle(`📋 ${nick} — Reportlar`)
      .addFields({name:'Bugun',value:`${td[0]?.reports_checked||0}`,inline:true},{name:'Haftalik',value:`${wk[0]?.total||0}`,inline:true})
    await replyEmbed(embed)
    return
  }

  // ─── REPORTALL [5+] ───
  if (cmd === 'reportall') {
    if (adminLevel < 5) { await reply(`${E.warn} Min Admin 5 kerak!`); return }
    if (!sitePool) { await reply(`${E.reject} DB ulangmagan`); return }
    const [allAdmins] = await gamePool.query('SELECT name FROM accounts WHERE admin>0').catch(()=>[[]])
    const [rows] = await sitePool.query('SELECT player_name,SUM(reports_checked) as total FROM admin_activity WHERE date>=DATE_SUB(CURDATE(),INTERVAL 7 DAY) GROUP BY player_name ORDER BY total DESC').catch(()=>[[]])
    const map = {}; rows.forEach(r=>map[r.player_name]=r.total||0)
    const embed = new EmbedBuilder().setColor('#3B82F6').setTitle('📋 Barcha Adminlar Reportlari (Haftalik)')
    const desc = allAdmins.map((a,i)=>`**${i+1}.** **${a.name}** — ${map[a.name]||0} report`).join('\n')
    embed.setDescription(desc.slice(0,2000)||"Yo'q")
    await replyEmbed(embed)
    return
  }

  // ─── TOPREPORT [5+] ───
  if (cmd === 'topreport') {
    if (adminLevel < 5) { await reply(`${E.warn} Min Admin 5 kerak!`); return }
    if (!sitePool) { await reply(`${E.reject} DB ulangmagan`); return }
    const [rows] = await sitePool.query('SELECT player_name,SUM(reports_checked) as total FROM admin_activity WHERE date>=DATE_SUB(CURDATE(),INTERVAL 7 DAY) GROUP BY player_name ORDER BY total DESC LIMIT 10').catch(()=>[[]])
    const embed = new EmbedBuilder().setColor('#F59E0B').setTitle(`${E.top1} Top Report Adminlar (Haftalik)`)
    const desc = rows.map((r,i)=>`${i===0?E.top1:i<3?E.top2:E.top3} **${r.player_name}** — ${r.total||0} report`).join('\n')
    embed.setDescription(desc||"Yo'q")
    await replyEmbed(embed)
    return
  }

  // ─── POSTNEWS [5+] ───
  if (cmd === 'postnews') {
    if (adminLevel < 5) { await reply(`${E.warn} Min Admin 5 kerak!`); return }
    const joy = interaction.options.getString('joy')
    const sarlavha = interaction.options.getString('sarlavha')
    const matn = interaction.options.getString('matn')
    const rasm = interaction.options.getString('rasm')
    const channelId = joy==='server'?CH_SERVER_NEWS:CH_ADMIN_NEWS
    const ch = await client.channels.fetch(channelId).catch(()=>null)
    if (!ch) { await reply(`${E.reject} Kanal topilmadi!`); return }
    const parsedMatn = parseEmojis(matn)
    const embed = new EmbedBuilder().setColor('#7C3AED').setTitle(`${E.news} ${sarlavha}`).setDescription(parsedMatn).setTimestamp().setFooter({text:`Shadows RP | ${playerInfo.name}`})
    if (rasm) embed.setImage(rasm)
    await ch.send({embeds:[embed]})
    await reply(`${E.ok} Yangilik **${joy==='server'?'Server':'Admin'}** kanaliga yuborildi!`)
    return
  }

  // ─── SENDALL [5+] ───
  if (cmd === 'sendall') {
    if (adminLevel < 5) { await reply(`${E.warn} Min Admin 5 kerak!`); return }
    const matn = interaction.options.getString('matn')
    await sendGameCommand(`ann:${playerInfo.name}:${matn}`)
    await reply(`${E.ok} Xabar barcha onlayn oyinchilarga yuborildi: **${matn}**`)
    return
  }

  // ─── FRAKSIYA ───
  if (cmd === 'fraksiya') {
    const teamId = interaction.options.getInteger('id')
    if (adminLevel < 5) {
      const [myData] = await gamePool.query('SELECT subdivison,team FROM accounts WHERE name=?',[playerInfo.name]).catch(()=>[[]])
      if (!myData[0]||myData[0].team!==teamId||(myData[0].subdivison||0)<5) {
        await reply(`${E.warn} Faqat fraksiya lideri yoki Admin 5+!`); return
      }
    }
    const [members] = await gamePool.query('SELECT name,level,online,totalhour,subdivison,id FROM accounts WHERE team=? ORDER BY subdivison DESC,level DESC',[teamId]).catch(()=>[[]])
    const tNames = {1:'Politsiya',2:'Tibbiyot',3:'Armiya',4:'SWAT',5:'FIB',6:'Sheriff',7:"Yong'inchi",8:'Mehnat',9:"Yo'l xizmati"}
    const embed = new EmbedBuilder().setColor('#7C3AED').setTitle(`${E.fraksiya} ${tNames[teamId]||'Fraksiya'} (${members.length} a'zo)`)
    const desc = members.map(m=>`${m.online==1?E.online:'⚫'} **${m.name}** (${m.id}) | ${m.level}lvl | Rank ${m.subdivison||0} | ${m.totalhour||0}s`).join('\n')
    embed.setDescription(desc.slice(0,2000)||"A'zo yo'q")
    await replyEmbed(embed)
    return
  }

  // ─── SETRANK ───
  if (cmd === 'setrank') {
    const nick = interaction.options.getString('nick')
    const rank = interaction.options.getInteger('rank')
    if (adminLevel < 5) {
      const [myData] = await gamePool.query('SELECT subdivison,team FROM accounts WHERE name=?',[playerInfo.name]).catch(()=>[[]])
      const [targetData] = await gamePool.query('SELECT team FROM accounts WHERE name=?',[nick]).catch(()=>[[]])
      if (!myData[0]||!targetData[0]||myData[0].team!==targetData[0].team||(myData[0].subdivison||0)<5) {
        await reply(`${E.warn} Faqat fraksiya lideri yoki Admin 5+!`); return
      }
    }
    await gamePool.query('UPDATE accounts SET subdivison=? WHERE name=?',[rank,nick])
    await reply(`${E.ok} **${nick}** rank **${rank}** ga o'rnatildi!`)
    return
  }

  // ═══ JAZO BUYRUQLAR ═══
  const g = (name) => interaction.options.getString(name)
  const gi = (name) => interaction.options.getInteger(name)

  if (cmd === 'ban') {
    const nick=g('nick'),vaqt=g('vaqt'),sabab=g('sabab')
    const target = await getPlayer(nick)
    if (!target) { await reply(`${E.notfound} **${nick}** topilmadi!`); return }
    if ((parseInt(target.admin)||0) >= adminLevel) { await reply(`${E.reject} Bu oyinchiga jazo bera olmaysiz!`); return }
    await gamePool.query("INSERT INTO ban_list(player,admin,reason,date) VALUES(?,?,?,NOW()) ON DUPLICATE KEY UPDATE reason=?,admin=?",[target.name,playerInfo.name,sabab,sabab,playerInfo.name]).catch(()=>{})
    await logPunishment(playerInfo.name,target.name,'BAN',sabab,vaqt,client)
    await reply(`${E.ban} **${target.name}** (${target.id}) banland!\nVaqt: ${vaqt} | Sabab: ${sabab}`)
    return
  }

  if (cmd === 'unban') {
    const nick=g('nick')
    await gamePool.query("DELETE FROM ban_list WHERE player=?",[nick]).catch(()=>{})
    await logPunishment(playerInfo.name,nick,'UNBAN','Ban bekor',null,client)
    await reply(`${E.unban} **${nick}** ban bekor qilindi!`)
    return
  }

  if (cmd === 'mute') {
    const nick=g('nick'),daqiqa=gi('daqiqa'),sabab=g('sabab')
    const target = await getPlayer(nick)
    if (!target) { await reply(`${E.notfound} **${nick}** topilmadi!`); return }
    await gamePool.query('UPDATE accounts SET mute=? WHERE name=?',[daqiqa,target.name])
    await logPunishment(playerInfo.name,target.name,'MUTE',sabab,`${daqiqa} daqiqa`,client)
    await reply(`${E.mute} **${target.name}** (${target.id}) ${daqiqa} daqiqa mute!\nSabab: ${sabab}`)
    return
  }

  if (cmd === 'unmute') {
    const nick=g('nick')
    const target = await getPlayer(nick)
    if (!target) { await reply(`${E.notfound} **${nick}** topilmadi!`); return }
    await gamePool.query('UPDATE accounts SET mute=0 WHERE name=?',[target.name])
    await logPunishment(playerInfo.name,target.name,'UNMUTE','Mute bekor',null,client)
    await reply(`${E.unmute} **${target.name}** mute bekor!`)
    return
  }

  if (cmd === 'warn') {
    const nick=g('nick'),sabab=g('sabab')
    const target = await getPlayer(nick)
    if (!target) { await reply(`${E.notfound} **${nick}** topilmadi!`); return }
    const w=(parseInt(target.warn)||0)+1
    await gamePool.query('UPDATE accounts SET warn=? WHERE name=?',[w,target.name])
    await logPunishment(playerInfo.name,target.name,'WARN',sabab,null,client)
    await reply(`${E.warn} **${target.name}** (${target.id}) warn (${w}/3)!\nSabab: ${sabab}`)
    return
  }

  if (cmd === 'unwarn') {
    const nick=g('nick')
    const target = await getPlayer(nick)
    if (!target) { await reply(`${E.notfound} **${nick}** topilmadi!`); return }
    await gamePool.query('UPDATE accounts SET warn=GREATEST(0,warn-1) WHERE name=?',[target.name])
    await logPunishment(playerInfo.name,target.name,'UNWARN','1 warn olindi',null,client)
    await reply(`${E.ok} **${target.name}** dan 1 warn olindi!`)
    return
  }

  if (cmd === 'kick') {
    const nick=g('nick'),sabab=g('sabab')
    const target = await getPlayer(nick)
    if (!target) { await reply(`${E.notfound} **${nick}** topilmadi!`); return }
    await sendGameCommand(`kick:${target.name}::${sabab}`)
    await logPunishment(playerInfo.name,target.name,'KICK',sabab,null,client)
    await reply(`${E.kick} **${target.name}** (${target.id}) kicklandi!\nSabab: ${sabab}`)
    return
  }

  if (cmd === 'jail') {
    const nick=g('nick'),daqiqa=gi('daqiqa'),sabab=g('sabab')
    const target = await getPlayer(nick)
    if (!target) { await reply(`${E.notfound} **${nick}** topilmadi!`); return }
    await gamePool.query('UPDATE accounts SET jail=? WHERE name=?',[daqiqa,target.name])
    await logPunishment(playerInfo.name,target.name,'JAIL',sabab,`${daqiqa} daqiqa`,client)
    await reply(`${E.jail} **${target.name}** (${target.id}) ${daqiqa} daqiqa qamoq!\nSabab: ${sabab}`)
    return
  }

  if (cmd === 'unjail') {
    const nick=g('nick')
    const target = await getPlayer(nick)
    if (!target) { await reply(`${E.notfound} **${nick}** topilmadi!`); return }
    await gamePool.query('UPDATE accounts SET jail=0 WHERE name=?',[target.name])
    await logPunishment(playerInfo.name,target.name,'UNJAIL','Qamoqdan chiqarildi',null,client)
    await reply(`${E.unjail} **${target.name}** qamoqdan chiqdi!`)
    return
  }

  // OFFLINE JAZOLAR
  if (cmd === 'offban') {
    const nick=g('nick'),sabab=g('sabab')
    const target = await getPlayer(nick)
    if (!target) { await reply(`${E.notfound} **${nick}** topilmadi!`); return }
    await gamePool.query("INSERT INTO ban_list(player,admin,reason,date) VALUES(?,?,?,NOW()) ON DUPLICATE KEY UPDATE reason=?,admin=?",[target.name,playerInfo.name,`[OFFLINE] ${sabab}`,`[OFFLINE] ${sabab}`,playerInfo.name]).catch(()=>{})
    await logPunishment(playerInfo.name,target.name,'OFFBAN',`[OFFLINE] ${sabab}`,null,client)
    await reply(`${E.ban} **${target.name}** offline ban!\nSabab: ${sabab}`)
    return
  }

  if (cmd === 'offmute') {
    const nick=g('nick'),daqiqa=gi('daqiqa'),sabab=g('sabab')
    const target = await getPlayer(nick)
    if (!target) { await reply(`${E.notfound} **${nick}** topilmadi!`); return }
    await gamePool.query('UPDATE accounts SET mute=? WHERE name=?',[daqiqa,target.name])
    await logPunishment(playerInfo.name,target.name,'OFFMUTE',`[OFFLINE] ${sabab}`,`${daqiqa} daqiqa`,client)
    await reply(`${E.mute} **${target.name}** offline ${daqiqa} daqiqa mute!\nSabab: ${sabab}`)
    return
  }

  if (cmd === 'offwarn') {
    const nick=g('nick'),sabab=g('sabab')
    const target = await getPlayer(nick)
    if (!target) { await reply(`${E.notfound} **${nick}** topilmadi!`); return }
    await gamePool.query('UPDATE accounts SET warn=warn+1 WHERE name=?',[target.name])
    await logPunishment(playerInfo.name,target.name,'OFFWARN',`[OFFLINE] ${sabab}`,null,client)
    await reply(`${E.warn} **${target.name}** offline warn!\nSabab: ${sabab}`)
    return
  }

  if (cmd === 'offjail') {
    const nick=g('nick'),daqiqa=gi('daqiqa'),sabab=g('sabab')
    const target = await getPlayer(nick)
    if (!target) { await reply(`${E.notfound} **${nick}** topilmadi!`); return }
    await gamePool.query('UPDATE accounts SET jail=? WHERE name=?',[daqiqa,target.name])
    await logPunishment(playerInfo.name,target.name,'OFFJAIL',`[OFFLINE] ${sabab}`,`${daqiqa} daqiqa`,client)
    await reply(`${E.jail} **${target.name}** offline ${daqiqa} daqiqa qamoq!\nSabab: ${sabab}`)
    return
  }

  if (cmd === 'offunjail') {
    const nick=g('nick')
    const target = await getPlayer(nick)
    if (!target) { await reply(`${E.notfound} **${nick}** topilmadi!`); return }
    await gamePool.query('UPDATE accounts SET jail=0 WHERE name=?',[target.name])
    await logPunishment(playerInfo.name,target.name,'OFFUNJAIL','[OFFLINE] Qamoqdan chiqarildi',null,client)
    await reply(`${E.unjail} **${target.name}** offline qamoqdan chiqdi!`)
    return
  }

  // PUL [5+]
  if (cmd === 'pul') {
    if (adminLevel < 5) { await reply(`${E.warn} Min Admin 5 kerak!`); return }
    const nick=g('nick'),miqdor=gi('miqdor')
    const target = await getPlayer(nick)
    if (!target) { await reply(`${E.notfound} **${nick}** topilmadi!`); return }
    await gamePool.query('UPDATE accounts SET money=money+? WHERE name=?',[miqdor,target.name])
    if (sitePool) await sitePool.query('INSERT INTO admin_logs(admin_name,action,details) VALUES(?,?,?)',[playerInfo.name,'Pul berish',`${nick} $${fmt(miqdor)}`]).catch(()=>{})
    await reply(`${E.money_give} **${target.name}** (${target.id}) ga **$${fmt(miqdor)}** berildi!`)
    return
  }

  // OLPUL [5+]
  if (cmd === 'olpul') {
    if (adminLevel < 5) { await reply(`${E.warn} Min Admin 5 kerak!`); return }
    const nick=g('nick'),miqdor=gi('miqdor')
    const target = await getPlayer(nick)
    if (!target) { await reply(`${E.notfound} **${nick}** topilmadi!`); return }
    await gamePool.query('UPDATE accounts SET money=GREATEST(0,money-?) WHERE name=?',[miqdor,target.name])
    if (sitePool) await sitePool.query('INSERT INTO admin_logs(admin_name,action,details) VALUES(?,?,?)',[playerInfo.name,'Pul olish',`${nick} $${fmt(miqdor)}`]).catch(()=>{})
    await reply(`${E.money_take} **${target.name}** (${target.id}) dan **$${fmt(miqdor)}** olindi!`)
    return
  }

  // SETLEVEL [5+]
  if (cmd === 'setlevel') {
    if (adminLevel < 5) { await reply(`${E.warn} Min Admin 5 kerak!`); return }
    const nick=g('nick'),daraja=gi('daraja')
    const target = await getPlayer(nick)
    if (!target) { await reply(`${E.notfound} **${nick}** topilmadi!`); return }
    await gamePool.query('UPDATE accounts SET level=? WHERE name=?',[Math.min(Math.max(daraja,1),100),target.name])
    if (sitePool) await sitePool.query('INSERT INTO admin_logs(admin_name,action,details) VALUES(?,?,?)',[playerInfo.name,'Daraja',`${nick} → ${daraja}`]).catch(()=>{})
    await reply(`${E.ok} **${target.name}** (${target.id}) daraja **${daraja}**!`)
    return
  }

  // HP
  if (cmd === 'hp') {
    const nick=g('nick'),miqdor=gi('miqdor')
    const target = await getPlayer(nick)
    if (!target) { await reply(`${E.notfound} **${nick}** topilmadi!`); return }
    await gamePool.query('UPDATE accounts SET health=? WHERE name=?',[Math.min(miqdor,100),target.name])
    await reply(`${E.ok} **${target.name}** HP **${Math.min(miqdor,100)}**!`)
    return
  }

  // HEAL
  if (cmd === 'heal') {
    const nick=g('nick')
    const target = await getPlayer(nick)
    if (!target) { await reply(`${E.notfound} **${nick}** topilmadi!`); return }
    await gamePool.query('UPDATE accounts SET health=100 WHERE name=?',[target.name])
    await reply(`${E.ok} **${target.name}** to'liq davolandi!`)
    return
  }
})

// ═══ START ═══
async function start() {
  await initDB()
  await client.login(TOKEN).catch(e=>{console.error('Bot login xatosi:',e.message);process.exit(1)})
}
start()

// Bot hisobi uchun session yaratish
async function createBotSession() {
  try {
    const BOT_NICK = process.env.BOT_NICK || 'Shadows_Bot'
    const BOT_PASS = process.env.BOT_PASS || 'shadows_bot_pass'
    
    // Game DB dan bot hisobini tekshirish
    const [r] = await gamePool.query('SELECT id,name,password,salt FROM accounts WHERE name=?',[BOT_NICK])
    if (!r[0]) { console.log('❌ Bot hisob topilmadi:', BOT_NICK); return }
    
    const hashed = require('crypto').createHash('sha256').update(BOT_PASS + r[0].salt).digest('hex').toUpperCase()
    if (hashed !== r[0].password) { console.log('❌ Bot paroli noto\'g\'ri!'); return }
    
    if (!sitePool) return
    const token = require('crypto').randomBytes(32).toString('hex')
    const expires = new Date(Date.now() + 30*24*60*60*1000).toISOString().slice(0,19).replace('T',' ')
    await sitePool.query('DELETE FROM sessions WHERE player_name=?',[BOT_NICK])
    await sitePool.query('INSERT INTO sessions(player_name,token,ip,expires) VALUES(?,?,?,?)',[BOT_NICK,token,'bot',expires])
    console.log('✅ Bot session yaratildi!')
  } catch(e) { console.log('Bot session xatosi:', e.message) }
}
