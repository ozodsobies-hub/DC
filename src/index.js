require('dotenv').config()
const { Client, GatewayIntentBits, Partials, EmbedBuilder, REST, Routes, SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Collection } = require('discord.js')
const mysql = require('mysql2/promise')
const { GoogleGenerativeAI } = require('@google/generative-ai')
const crypto = require('crypto')

// ═══ CONFIG ═══
const TOKEN = process.env.DISCORD_TOKEN || 'MTUyMDUxNzU1MDM4NjE4NDI0Mw.G9McQC.wrYP6Et-bjfKpwroxbPeXG_oCdMnWz9iwIJ2Ig'
const CLIENT_ID = '1520517550386184243'
const OWNER_NICK = process.env.OWNER_NICK || 'Nodirbek_Hatred'

// Kanallar
const CH_SERVER_NEWS  = '1500773549554798602'
const CH_ADMIN_NEWS   = '1500945593407639715'
const CH_GAME_CHAT    = '1501055278827704551'
const CH_PUNISHMENTS  = '1501081847046865057'
const GUILD_MAIN      = '1500771666027085836'
const GUILD_ADMIN     = '1500945591281258729'
const ROLE_MEMBER     = '1500772487896629298'
const ROLE_ADMIN      = '1500953705405485158'

// Emoji IDlar
const E = {
  ok:      '<:ok:1520802211498688702>',
  reject:  '<:reject:1520802491783188500>',
  notfound:'<:notfound:1522565876812087398>',
  id:      '<:id:1523056367336821009>',
  warn:    '<:warn:1520803081359458364>',
  money_take: '<:moneytake:1523057509940727818>',
  money_give: '<:moneygive:1523057773846335638>',
  ban:     '<:ban:1523058258682581042>',
  unban:   '<:unban:1523059170893631660>',
  mute:    '<:mute:1523059895065120989>',
  unmute:  '<:unmute:1523059170893631660>',
}

// DB
const GAME_DB = {
  host:'188.127.241.8', port:3306,
  user:'gs137892', password:'XFpWuN7kssXj',
  database:'gs137892', waitForConnections:true, connectionLimit:10, connectTimeout:15000
}

let gamePool, sitePool
const pendingVerify = new Map() // dcId -> {nick, step}

// ═══ DB ═══
async function initDB() {
  try { gamePool = mysql.createPool(GAME_DB); await gamePool.query('SELECT 1'); console.log('✅ Game DB ulandi!') } catch(e) { console.error('❌ Game DB:', e.message) }
  
  const siteCfg = {
    host: process.env.SITE_DB_HOST || 'zephyr.proxy.rlwy.net',
    port: parseInt(process.env.SITE_DB_PORT || '35377'),
    user: process.env.SITE_DB_USER || 'root',
    password: process.env.SITE_DB_PASS || 'HQMqKjcxPaoAXsaqNdrMRhcFRzPusZhj',
    database: process.env.SITE_DB_NAME || 'railway',
    waitForConnections:true, connectionLimit:5, connectTimeout:20000
  }
  
  for (let i = 0; i < 3; i++) {
    try {
      sitePool = mysql.createPool(siteCfg)
      await sitePool.query('SELECT 1')
      console.log('✅ Site DB ulandi!')
      await createTables()
      return
    } catch(e) {
      console.error(`❌ Site DB urinish ${i+1}:`, e.message)
      await new Promise(r => setTimeout(r, 3000))
    }
  }
  console.error('❌ Site DB ga ulanib bo\'lmadi!')
}

async function createTables() {
  await sitePool.query(`CREATE TABLE IF NOT EXISTS admin_dc_users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    player_name VARCHAR(64) NOT NULL UNIQUE,
    dc_user_id VARCHAR(64) UNIQUE,
    dc_username VARCHAR(64),
    is_verified TINYINT DEFAULT 0,
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

// ═══ SLASH COMMANDS ═══
const slashCommands = [
  new SlashCommandBuilder().setName('start').setDescription('Barcha buyruqlar ro\'yxati'),
  new SlashCommandBuilder().setName('help').setDescription('Yordam'),
  new SlashCommandBuilder().setName('setdc').setDescription('Akkauntingizni Discord ga bog\'lash').addStringOption(o=>o.setName('nick').setDescription('O\'yindagi nikingiz').setRequired(true)),
  new SlashCommandBuilder().setName('myid').setDescription('Discord ID ingizni ko\'rish'),
  new SlashCommandBuilder().setName('profil').setDescription('O\'z profilingizni ko\'rish'),
  new SlashCommandBuilder().setName('top').setDescription('Reyting').addStringOption(o=>o.setName('tur').setDescription('level/money/score/hours').setRequired(false)),
  new SlashCommandBuilder().setName('online').setDescription('Onlayn o\'yinchilar'),
  new SlashCommandBuilder().setName('mypul').setDescription('Mening pulim'),
  new SlashCommandBuilder().setName('server').setDescription('Server ma\'lumoti'),
  new SlashCommandBuilder().setName('transfer').setDescription('Pul o\'tkazish').addStringOption(o=>o.setName('nick').setDescription('Qabul qiluvchi').setRequired(true)).addIntegerOption(o=>o.setName('miqdor').setDescription('Miqdor').setRequired(true)),
  // Admin buyruqlar
  new SlashCommandBuilder().setName('admins').setDescription('Onlayn adminlar [Admin 5+]'),
  new SlashCommandBuilder().setName('active').setDescription('Oyinchi aktivligi [Admin 5+]').addStringOption(o=>o.setName('nick').setDescription('Nick nomi').setRequired(true)).addStringOption(o=>o.setName('davr').setDescription('today/week').setRequired(false)),
  new SlashCommandBuilder().setName('activeall').setDescription('Barcha adminlar aktivligi [Admin 5+]').addStringOption(o=>o.setName('davr').setDescription('today/week').setRequired(false)),
  new SlashCommandBuilder().setName('myactive').setDescription('Mening aktivligim').addStringOption(o=>o.setName('davr').setDescription('today/week').setRequired(false)),
  new SlashCommandBuilder().setName('report').setDescription('Oyinchi reportlari [Admin 5+]').addStringOption(o=>o.setName('nick').setDescription('Nick nomi').setRequired(true)),
  new SlashCommandBuilder().setName('reportall').setDescription('Barcha adminlar reportlari [Admin 5+]'),
  new SlashCommandBuilder().setName('ban').setDescription('Ban [Admin 1+]').addStringOption(o=>o.setName('nick').setDescription('Nick yoki ID').setRequired(true)).addStringOption(o=>o.setName('vaqt').setDescription('Davomiyligi').setRequired(true)).addStringOption(o=>o.setName('sabab').setDescription('Sababi').setRequired(true)),
  new SlashCommandBuilder().setName('unban').setDescription('Unban [Admin 1+]').addStringOption(o=>o.setName('nick').setDescription('Nick nomi').setRequired(true)),
  new SlashCommandBuilder().setName('mute').setDescription('Mute [Admin 1+]').addStringOption(o=>o.setName('nick').setDescription('Nick').setRequired(true)).addIntegerOption(o=>o.setName('daqiqa').setDescription('Daqiqa').setRequired(true)).addStringOption(o=>o.setName('sabab').setDescription('Sabab').setRequired(true)),
  new SlashCommandBuilder().setName('unmute').setDescription('Unmute [Admin 1+]').addStringOption(o=>o.setName('nick').setDescription('Nick').setRequired(true)),
  new SlashCommandBuilder().setName('warn').setDescription('Warn [Admin 1+]').addStringOption(o=>o.setName('nick').setDescription('Nick').setRequired(true)).addStringOption(o=>o.setName('sabab').setDescription('Sabab').setRequired(true)),
  new SlashCommandBuilder().setName('unwarn').setDescription('Unwarn [Admin 1+]').addStringOption(o=>o.setName('nick').setDescription('Nick').setRequired(true)),
  new SlashCommandBuilder().setName('kick').setDescription('Kick [Admin 1+]').addStringOption(o=>o.setName('nick').setDescription('Nick').setRequired(true)).addStringOption(o=>o.setName('sabab').setDescription('Sabab').setRequired(true)),
  new SlashCommandBuilder().setName('jail').setDescription('Jail [Admin 1+]').addStringOption(o=>o.setName('nick').setDescription('Nick').setRequired(true)).addIntegerOption(o=>o.setName('daqiqa').setDescription('Daqiqa').setRequired(true)).addStringOption(o=>o.setName('sabab').setDescription('Sabab').setRequired(true)),
  new SlashCommandBuilder().setName('unjail').setDescription('Unjail [Admin 1+]').addStringOption(o=>o.setName('nick').setDescription('Nick').setRequired(true)),
  new SlashCommandBuilder().setName('offjail').setDescription('Offline Jail [Admin 1+]').addStringOption(o=>o.setName('nick').setDescription('Nick').setRequired(true)).addIntegerOption(o=>o.setName('daqiqa').setDescription('Daqiqa').setRequired(true)).addStringOption(o=>o.setName('sabab').setDescription('Sabab').setRequired(true)),
  new SlashCommandBuilder().setName('offunjail').setDescription('Offline Unjail [Admin 1+]').addStringOption(o=>o.setName('nick').setDescription('Nick').setRequired(true)),
  new SlashCommandBuilder().setName('offban').setDescription('Offline Ban [Admin 1+]').addStringOption(o=>o.setName('nick').setDescription('Nick').setRequired(true)).addStringOption(o=>o.setName('sabab').setDescription('Sabab').setRequired(true)),
  new SlashCommandBuilder().setName('offmute').setDescription('Offline Mute [Admin 1+]').addStringOption(o=>o.setName('nick').setDescription('Nick').setRequired(true)).addIntegerOption(o=>o.setName('daqiqa').setDescription('Daqiqa').setRequired(true)).addStringOption(o=>o.setName('sabab').setDescription('Sabab').setRequired(true)),
  new SlashCommandBuilder().setName('offwarn').setDescription('Offline Warn [Admin 1+]').addStringOption(o=>o.setName('nick').setDescription('Nick').setRequired(true)).addStringOption(o=>o.setName('sabab').setDescription('Sabab').setRequired(true)),
  new SlashCommandBuilder().setName('pul').setDescription('Pul berish [Admin 5+]').addStringOption(o=>o.setName('nick').setDescription('Nick').setRequired(true)).addIntegerOption(o=>o.setName('miqdor').setDescription('Miqdor').setRequired(true)),
  new SlashCommandBuilder().setName('olpul').setDescription('Pul olish [Admin 5+]').addStringOption(o=>o.setName('nick').setDescription('Nick').setRequired(true)).addIntegerOption(o=>o.setName('miqdor').setDescription('Miqdor').setRequired(true)),
  new SlashCommandBuilder().setName('setlevel').setDescription('Daraja [Admin 5+]').addStringOption(o=>o.setName('nick').setDescription('Nick').setRequired(true)).addIntegerOption(o=>o.setName('daraja').setDescription('Daraja').setRequired(true)),
  new SlashCommandBuilder().setName('hp').setDescription('HP berish [Admin 1+]').addStringOption(o=>o.setName('nick').setDescription('Nick').setRequired(true)).addIntegerOption(o=>o.setName('miqdor').setDescription('Miqdor').setRequired(true)),
  new SlashCommandBuilder().setName('heal').setDescription('Davolash [Admin 1+]').addStringOption(o=>o.setName('nick').setDescription('Nick').setRequired(true)),
  new SlashCommandBuilder().setName('postnews').setDescription('Yangilik yozish [Admin 5+]').addStringOption(o=>o.setName('joy').setDescription('admin/server').setRequired(true)).addStringOption(o=>o.setName('sarlavha').setDescription('Sarlavha').setRequired(true)).addStringOption(o=>o.setName('matn').setDescription('Matn').setRequired(true)),
  new SlashCommandBuilder().setName('banlist').setDescription('Ban ro\'yxati [Admin 1+]'),
  new SlashCommandBuilder().setName('fraksiya').setDescription('Fraksiya a\'zolari [Lider]').addIntegerOption(o=>o.setName('id').setDescription('Fraksiya ID').setRequired(true)),
  new SlashCommandBuilder().setName('setrank').setDescription('Rank o\'rnatish [Lider]').addStringOption(o=>o.setName('nick').setDescription('Nick').setRequired(true)).addIntegerOption(o=>o.setName('rank').setDescription('Rank').setRequired(true)),
].map(c => c.toJSON())

async function registerSlashCommands() {
  const rest = new REST({ version:'10' }).setToken(TOKEN)
  try {
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_MAIN), { body: slashCommands })
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ADMIN), { body: slashCommands })
    console.log('✅ Slash commands ro\'yxatdan o\'tdi!')
  } catch(e) { console.error('Slash command xato:', e.message) }
}

// ═══ HELPERS ═══
const fmt = v => Number(v||0).toLocaleString('ru-RU')
const teamNames = {0:'Fuqaro',1:'Politsiya',2:'Tibbiyot',3:'Armiya',4:'SWAT',5:'FIB',6:'Sheriff',7:"Yong'inchi",8:'Mehnat',9:"Yo'l xizmati"}
const adminLvl = {0:"O'yinchi",1:'Yangi Admin',2:'Admin',3:'Senior Admin',4:'Bosh Admin',5:'Co-Owner',6:'Super Admin',13:'Owner'}
const today = () => new Date().toISOString().split('T')[0]

async function getPlayer(nameOrId) {
  try {
    // ID bilan qidirish (raqam bo'lsa)
    if (/^\d+$/.test(nameOrId)) {
      const [r] = await gamePool.query('SELECT * FROM accounts WHERE id=?', [nameOrId])
      if (r[0]) return r[0]
    }
    const [r] = await gamePool.query('SELECT * FROM accounts WHERE name=?', [nameOrId])
    return r[0]||null
  } catch { return null }
}

async function getDcUser(dcId) {
  try {
    if (!sitePool) return null
    const [r] = await sitePool.query('SELECT * FROM admin_dc_users WHERE dc_user_id=? AND is_verified=1', [dcId])
    return r[0]||null
  } catch { return null }
}

async function getAdminLevel(playerName) {
  try {
    const [r] = await gamePool.query('SELECT admin FROM accounts WHERE name=?', [playerName])
    return r[0]?.admin || 0
  } catch { return 0 }
}

async function logPunishment(adminNick, playerNick, type, reason, duration, client) {
  try {
    const ch = await client.channels.fetch(CH_PUNISHMENTS).catch(()=>null)
    if (!ch) return
    let adminMention = `**${adminNick}**`
    if (sitePool) {
      const [dc] = await sitePool.query('SELECT dc_user_id FROM admin_dc_users WHERE player_name=?',[adminNick]).catch(()=>[[]])
      if (dc[0]?.dc_user_id) adminMention = `<@${dc[0].dc_user_id}>`
    }
    const typeEmoji = {BAN:E.ban,KICK:'👢',MUTE:E.mute,WARN:E.warn,JAIL:'🔒',UNBAN:E.unban,UNMUTE:E.unmute,UNWARN:'✅',UNJAIL:'🔓',OFFJAIL:'🔒',OFFBAN:E.ban,OFFMUTE:E.mute,OFFWARN:E.warn}
    const typeColor = {BAN:0xEF4444,KICK:0xF59E0B,MUTE:0x9D4EDD,WARN:0xF59E0B,JAIL:0xEF4444,OFFJAIL:0xEF4444,OFFBAN:0xEF4444}
    const embed = new EmbedBuilder()
      .setColor(typeColor[type]||0x9D4EDD)
      .setTitle(`${typeEmoji[type]||'⚖️'} ${type} — ${playerNick}`)
      .addFields(
        {name:'👮 Admin', value:adminMention, inline:true},
        {name:'🎯 Oyinchi', value:`**${playerNick}**`, inline:true},
        {name:'📋 Sabab', value:reason||"Ko'rsatilmagan"},
        ...(duration?[{name:'⏱️ Vaqt',value:duration,inline:true}]:[])
      ).setTimestamp()
    await ch.send({embeds:[embed]})
    if (sitePool) {
      await sitePool.query('INSERT INTO punishment_logs(admin_nick,player_nick,type,reason,duration) VALUES(?,?,?,?,?)',[adminNick,playerNick,type,reason,duration||null]).catch(()=>{})
      await sitePool.query('INSERT INTO admin_activity(player_name,date,punishments_given) VALUES(?,?,1) ON DUPLICATE KEY UPDATE punishments_given=punishments_given+1',[adminNick,today()]).catch(()=>{})
    }
  } catch(e) { console.error('Log xato:', e.message) }
}

// Emoji ID larni parse qilish {1234567} -> <:emoji:1234567>
function parseEmojis(text) {
  return text.replace(/\{(\d+)\}/g, (_, id) => `<:e${id}:${id}>`)
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

client.once('clientReady', async () => {
  console.log(`✅ Bot tayyor: ${client.user.tag}`)
  await registerSlashCommands()
  // Rol berish
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

// ═══ SETDC VERIFY - DM orqali ═══
client.on('messageCreate', async message => {
  if (message.author.bot) return

  // DM da parol tekshiruvi
  if (!message.guild && pendingVerify.has(message.author.id)) {
    const pending = pendingVerify.get(message.author.id)
    const password = message.content.trim()

    try {
      const p = await getPlayer(pending.nick)
      if (!p) {
        await message.reply('❌ Oyinchi topilmadi!')
        pendingVerify.delete(message.author.id)
        return
      }

      // Parolni tekshirish
      const hashed = crypto.createHash('sha256').update(password + p.salt).digest('hex').toUpperCase()
      if (hashed !== p.password) {
        await message.reply(`${E.reject} Parol noto'g'ri! Qayta urinib ko'ring yoki /setdc ni qaytadan yozing.`)
        pendingVerify.delete(message.author.id)
        return
      }

      // Parol to'g'ri - bog'lash
      if (sitePool) {
        await sitePool.query(
          'INSERT INTO admin_dc_users(player_name,dc_user_id,dc_username,is_verified) VALUES(?,?,?,1) ON DUPLICATE KEY UPDATE dc_user_id=?,dc_username=?,is_verified=1',
          [pending.nick, message.author.id, message.author.username, message.author.id, message.author.username]
        )
      }

      await message.reply(`${E.ok} **${pending.nick}** akkauntingiz muvaffaqiyatli bog'landi!\n\nEndi /start yozing va barcha buyruqlarni ko'ring.`)
      pendingVerify.delete(message.author.id)
    } catch(e) {
      await message.reply(`❌ Xato: ${e.message}`)
      pendingVerify.delete(message.author.id)
    }
    return
  }

  // Toxicity check
  if (message.channel?.id === CH_SERVER_NEWS && message.content.length > 3) {
    try {
      if (sitePool) {
        const [muted] = await sitePool.query('SELECT * FROM muted_dc_users WHERE dc_user_id=? AND muted_until>NOW()',[message.author.id]).catch(()=>[[]])
        if (muted.length > 0) {
          await message.delete().catch(()=>{})
          await message.author.send(`${E.reject} Siz ${new Date(muted[0].muted_until).toLocaleString('uz-UZ')} gacha mutesiz!`).catch(()=>{})
          return
        }
      }
    } catch {}
  }
})

// ═══ SLASH COMMAND HANDLER ═══
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return

  const cmd = interaction.commandName
  const dcUser = await getDcUser(interaction.user.id)
  const playerInfo = dcUser ? await getPlayer(dcUser.player_name) : null
  const adminLevel = playerInfo ? (parseInt(playerInfo.admin)||0) : 0
  const isAdmin = adminLevel >= 1

  // Helper - ephemeral reply
  const reply = (content, ephemeral=false) => interaction.reply({content, ephemeral}).catch(()=>{})
  const replyEmbed = (embed, ephemeral=false) => interaction.reply({embeds:[embed], ephemeral}).catch(()=>{})

  // ─── SETDC ───
  if (cmd === 'setdc') {
    const nick = interaction.options.getString('nick')
    const p = await getPlayer(nick)
    if (!p) { await reply(`${E.notfound} **${nick}** o'yinda topilmadi!`, true); return }

    // Pending ga qo'shish
    pendingVerify.set(interaction.user.id, { nick, time: Date.now() })

    // DM yuborish
    try {
      await interaction.user.send(`🔐 **${nick}** akkauntini bog'lash uchun o'yindagi parolingizni yozing:\n\n_(Xavfsizlik uchun bu yerda yozing — kanalda emas!)_`)
      await reply(`${E.id} DM ga parol so'rovi yuborildi! Shaxsiy xabarnomangizni tekshiring.`, true)
    } catch {
      await reply(`${E.reject} DM yuborib bo'lmadi! Discord sozlamalarida shaxsiy xabarlarni yoqing.`, true)
      pendingVerify.delete(interaction.user.id)
    }

    // 5 daqiqadan keyin o'chirish
    setTimeout(() => pendingVerify.delete(interaction.user.id), 5*60*1000)
    return
  }

  // ─── MYID ───
  if (cmd === 'myid') {
    await reply(`${E.id} Sizning Discord ID: \`${interaction.user.id}\``, true)
    return
  }

  // ─── START / HELP ───
  if (cmd === 'start' || cmd === 'help') {
    if (isAdmin) {
      const embed = new EmbedBuilder().setColor('#7C3AED').setTitle('🛡️ Admin Buyruqlari')
        .setDescription(`Salom **${playerInfo.name}** (${adminLvl[adminLevel]||'Admin'})!`)
        .addFields(
          {name:'👤 Profil',value:'`/profil` `/top` `/online` `/server`',inline:false},
          {name:'⚖️ Jazo [1+]',value:'`/ban` `/unban` `/mute` `/unmute`\n`/warn` `/unwarn` `/kick` `/jail` `/unjail`',inline:false},
          {name:'🔴 Offline Jazo [1+]',value:'`/offban` `/offmute` `/offwarn` `/offjail` `/offunjail`',inline:false},
          {name:'💊 Sog\'liq [1+]',value:'`/hp <nick> <miqdor>` `/heal <nick>`',inline:false},
          {name:'📊 Aktivlik [5+]',value:'`/myactive` `/active <nick>` `/activeall`\n`/report <nick>` `/reportall`',inline:false},
          {name:'👥 Admin [5+]',value:'`/admins` `/banlist`',inline:false},
          {name:'💰 Moliya [5+]',value:'`/pul <nick> <miqdor>` `/olpul <nick> <miqdor>`',inline:false},
          {name:'⭐ Daraja [5+]',value:'`/setlevel <nick> <daraja>`',inline:false},
          {name:'📰 Yangilik [5+]',value:'`/postnews <joy> <sarlavha> <matn>`\njoy: `admin` yoki `server`',inline:false},
          {name:'🏢 Fraksiya [Lider]',value:'`/fraksiya <id>` `/setrank <nick> <rank>`',inline:false},
        ).setFooter({text:'Shadows RP Bot'})
      await replyEmbed(embed, true)
    } else {
      const embed = new EmbedBuilder().setColor('#7C3AED').setTitle('📋 Shadows RP Buyruqlari')
        .addFields(
          {name:'👤 Profil',value:'`/profil` — O\'z profilingiz\n`/top` — Reyting\n`/online` — Onlayn o\'yinchilar',inline:false},
          {name:'💰 Moliya',value:'`/mypul` — Mening pulim\n`/transfer <nick> <miqdor>` — Pul o\'tkazish',inline:false},
          {name:'🔗 Bog\'lanish',value:'`/setdc <nick>` — Akkaunt bog\'lash\n`/myid` — Discord ID',inline:false},
          {name:'📰 Ma\'lumot',value:'`/server` — Server info',inline:false},
        )
      await replyEmbed(embed, true)
    }
    return
  }

  // ─── PROFIL ───
  if (cmd === 'profil') {
    if (!dcUser) { await reply(`${E.reject} Avval \`/setdc\` bilan akkauntingizni bog'lang!`, true); return }
    const p = playerInfo
    if (!p) { await reply(`${E.notfound} Profil topilmadi!`, true); return }
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
    await replyEmbed(embed, true)
    return
  }

  // ─── TOP ───
  if (cmd === 'top') {
    const type = interaction.options.getString('tur')||'level'
    const om = {level:'level',money:'money',score:'score',hours:'totalhour'}
    const order = om[type]||'level'
    const [players] = await gamePool.query(`SELECT name,level,money,score,totalhour,online FROM accounts ORDER BY ${order} DESC LIMIT 10`).catch(()=>[[]])
    const medals = ['🥇','🥈','🥉','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟']
    const desc = players.map((p,i)=>{
      const val = type==='money'?`$${fmt(p.money)}`:type==='hours'?`${p.totalhour||0}s`:type==='score'?`${p.score||0}pt`:`${p.level}lvl`
      return `${medals[i]} **${p.name}** — ${val} ${p.online==1?'🟢':''}`
    }).join('\n')
    const embed = new EmbedBuilder().setColor('#F59E0B').setTitle(`🏆 Top 10 — ${type}`).setDescription(desc||"Yo'q")
    await replyEmbed(embed)
    return
  }

  // ─── ONLINE ───
  if (cmd === 'online') {
    const [players] = await gamePool.query('SELECT name,level,team FROM accounts WHERE online=1 ORDER BY level DESC LIMIT 25').catch(()=>[[]])
    const embed = new EmbedBuilder().setColor('#10B981').setTitle(`🟢 Onlayn (${players.length})`)
    embed.setDescription(players.length?players.map(p=>`• **${p.name}** (${p.level}lvl) — ${teamNames[p.team]||'Fuqaro'}`).join('\n').slice(0,2000):"Hech kim onlayn emas")
    await replyEmbed(embed)
    return
  }

  // ─── MYPUL ───
  if (cmd === 'mypul') {
    if (!dcUser) { await reply(`${E.reject} Avval \`/setdc\` bilan bog'lang!`, true); return }
    const p = playerInfo; if (!p) return
    await reply(`💰 **${p.name}**\nNaqd: **$${fmt(p.money)}**\nBank: **$${fmt(p.bank)}**`, true)
    return
  }

  // ─── SERVER ───
  if (cmd === 'server') {
    const [[{total}]] = await gamePool.query('SELECT COUNT(*) as total FROM accounts').catch(()=>[[{total:0}]])
    const [[{online}]] = await gamePool.query('SELECT COUNT(*) as online FROM accounts WHERE online=1').catch(()=>[[{online:0}]])
    const embed = new EmbedBuilder().setColor('#7C3AED').setTitle('🎮 Shadows RP')
      .addFields(
        {name:'🌐 IP',value:'play.shadowsrp.uz',inline:true},
        {name:'🟢 Onlayn',value:`${online}`,inline:true},
        {name:'👥 Jami',value:`${total}`,inline:true},
      )
    await replyEmbed(embed)
    return
  }

  // ─── TRANSFER ───
  if (cmd === 'transfer') {
    if (!dcUser) { await reply(`${E.reject} Avval \`/setdc\` bilan bog'lang!`, true); return }
    const toNick = interaction.options.getString('nick')
    const amount = interaction.options.getInteger('miqdor')
    const from = playerInfo; if (!from) return
    const to = await getPlayer(toNick)
    if (!to) { await reply(`${E.notfound} **${toNick}** topilmadi!`, true); return }
    if (from.money < amount) { await reply(`${E.reject} Yetarli pul yo'q! Sizda: $${fmt(from.money)}`, true); return }
    if (amount > 10000000) { await reply(`${E.reject} Maksimal: $10,000,000`, true); return }
    if (from.name === to.name) { await reply(`${E.reject} O'zingizga o'tkaza olmaysiz!`, true); return }
    await gamePool.query('UPDATE accounts SET money=money-? WHERE name=?',[amount,from.name])
    await gamePool.query('UPDATE accounts SET money=money+? WHERE name=?',[amount,to.name])
    await reply(`${E.money_give} **$${fmt(amount)}** **${from.name}** → **${to.name}**`)
    return
  }

  // ════ ADMIN BUYRUQLAR ════
  if (!isAdmin) {
    await reply(`${E.reject} Bu buyruq faqat adminlar uchun! \`/setdc\` bilan bog'lang.`, true)
    return
  }

  // ─── ADMINS [5+] ───
  if (cmd === 'admins') {
    if (adminLevel < 5) { await reply(`${E.warn} Min Admin 5 kerak!`, true); return }
    const [admins] = await gamePool.query('SELECT name,admin,online,totalhour FROM accounts WHERE admin>0 ORDER BY admin DESC LIMIT 20').catch(()=>[[]])
    let desc = ''
    for (const a of admins) {
      let mention = ''
      if (sitePool) {
        const [dc] = await sitePool.query('SELECT dc_user_id FROM admin_dc_users WHERE player_name=? AND is_verified=1',[a.name]).catch(()=>[[]])
        if (dc[0]?.dc_user_id) mention = `<@${dc[0].dc_user_id}>`
      }
      desc += `${a.online==1?'🟢':'⚫'} **${a.name}** (${adminLvl[a.admin]||'Admin'}) ${mention}\n`
    }
    const embed = new EmbedBuilder().setColor('#9D4EDD').setTitle('🛡️ Adminlar').setDescription(desc||"Yo'q")
    await replyEmbed(embed)
    return
  }

  // ─── MYACTIVE ───
  if (cmd === 'myactive') {
    if (!sitePool) { await reply(`${E.reject} DB ulangmagan`, true); return }
    const davr = interaction.options.getString('davr')||'today'
    if (davr === 'week') {
      const [r] = await sitePool.query('SELECT SUM(online_minutes) as mins,SUM(reports_checked) as reports,SUM(complaints_closed) as complaints,SUM(punishments_given) as punishments FROM admin_activity WHERE player_name=? AND date>=DATE_SUB(CURDATE(),INTERVAL 7 DAY)',[playerInfo.name]).catch(()=>[[{}]])
      const d=r[0]||{}
      const embed = new EmbedBuilder().setColor('#7C3AED').setTitle(`📊 ${playerInfo.name} — Haftalik`)
        .addFields({name:'⏱️ Online',value:`${d.mins||0} daqiqa`,inline:true},{name:'📋 Report',value:`${d.reports||0}`,inline:true},{name:'📝 Shikoyat',value:`${d.complaints||0}`,inline:true},{name:'⚖️ Jazo',value:`${d.punishments||0}`,inline:true})
      await replyEmbed(embed, true)
    } else {
      const [r] = await sitePool.query('SELECT * FROM admin_activity WHERE player_name=? AND date=?',[playerInfo.name,today()]).catch(()=>[[]])
      const d=r[0]||{}
      const embed = new EmbedBuilder().setColor('#7C3AED').setTitle(`📊 ${playerInfo.name} — Bugun`)
        .addFields({name:'⏱️ Online',value:`${d.online_minutes||0} daqiqa`,inline:true},{name:'📋 Report',value:`${d.reports_checked||0}`,inline:true},{name:'📝 Shikoyat',value:`${d.complaints_closed||0}`,inline:true},{name:'⚖️ Jazo',value:`${d.punishments_given||0}`,inline:true})
        .setFooter({text:today()})
      await replyEmbed(embed, true)
    }
    return
  }

  // ─── ACTIVE [5+] ───
  if (cmd === 'active') {
    if (adminLevel < 5) { await reply(`${E.warn} Min Admin 5 kerak!`, true); return }
    if (!sitePool) { await reply(`${E.reject} DB ulangmagan`, true); return }
    const nick = interaction.options.getString('nick')
    const davr = interaction.options.getString('davr')||'today'
    const p = await getPlayer(nick)
    if (!p) { await reply(`${E.notfound} **${nick}** topilmadi!`, true); return }
    if (davr === 'week') {
      const [r] = await sitePool.query('SELECT SUM(online_minutes) as mins,SUM(reports_checked) as reports,SUM(complaints_closed) as complaints,SUM(punishments_given) as punishments FROM admin_activity WHERE player_name=? AND date>=DATE_SUB(CURDATE(),INTERVAL 7 DAY)',[nick]).catch(()=>[[{}]])
      const d=r[0]||{}
      const embed = new EmbedBuilder().setColor('#7C3AED').setTitle(`📊 ${nick} — Haftalik`)
        .addFields({name:'⏱️ Online',value:`${d.mins||0} daqiqa`,inline:true},{name:'📋 Report',value:`${d.reports||0}`,inline:true},{name:'📝 Shikoyat',value:`${d.complaints||0}`,inline:true},{name:'⚖️ Jazo',value:`${d.punishments||0}`,inline:true})
      await replyEmbed(embed)
    } else {
      const [r] = await sitePool.query('SELECT * FROM admin_activity WHERE player_name=? AND date=?',[nick,today()]).catch(()=>[[]])
      const d=r[0]||{}
      const embed = new EmbedBuilder().setColor('#7C3AED').setTitle(`📊 ${nick} — Bugun`)
        .addFields({name:'⏱️ Online',value:`${d.online_minutes||0} daqiqa`,inline:true},{name:'📋 Report',value:`${d.reports_checked||0}`,inline:true},{name:'📝 Shikoyat',value:`${d.complaints_closed||0}`,inline:true},{name:'⚖️ Jazo',value:`${d.punishments_given||0}`,inline:true})
      await replyEmbed(embed)
    }
    return
  }

  // ─── ACTIVEALL [5+] ───
  if (cmd === 'activeall') {
    if (adminLevel < 5) { await reply(`${E.warn} Min Admin 5 kerak!`, true); return }
    if (!sitePool) { await reply(`${E.reject} DB ulangmagan`, true); return }
    const davr = interaction.options.getString('davr')||'today'
    const where = davr==='week'?'AND date>=DATE_SUB(CURDATE(),INTERVAL 7 DAY)':'AND date=CURDATE()'
    const [rows] = await sitePool.query(`SELECT player_name,SUM(online_minutes) as mins,SUM(reports_checked) as reports,SUM(complaints_closed) as complaints,SUM(punishments_given) as punishments FROM admin_activity WHERE 1=1 ${where} GROUP BY player_name ORDER BY mins DESC LIMIT 20`).catch(()=>[[]])
    const embed = new EmbedBuilder().setColor('#7C3AED').setTitle(`📊 Barcha Adminlar Aktivligi — ${davr==='week'?'Haftalik':'Bugun'}`)
    const desc = rows.length ? rows.map((r,i)=>`**${i+1}.** ${r.player_name} | ⏱️${r.mins||0}d | 📋${r.reports||0} | ⚖️${r.punishments||0}`).join('\n') : "Ma'lumot yo'q"
    embed.setDescription(desc)
    await replyEmbed(embed)
    return
  }

  // ─── REPORT [5+] ───
  if (cmd === 'report') {
    if (adminLevel < 5) { await reply(`${E.warn} Min Admin 5 kerak!`, true); return }
    if (!sitePool) { await reply(`${E.reject} DB ulangmagan`, true); return }
    const nick = interaction.options.getString('nick')
    const [today_r] = await sitePool.query('SELECT reports_checked FROM admin_activity WHERE player_name=? AND date=?',[nick,today()]).catch(()=>[[]])
    const [week_r] = await sitePool.query('SELECT SUM(reports_checked) as total FROM admin_activity WHERE player_name=? AND date>=DATE_SUB(CURDATE(),INTERVAL 7 DAY)',[nick]).catch(()=>[[{}]])
    const embed = new EmbedBuilder().setColor('#3B82F6').setTitle(`📋 ${nick} — Reportlar`)
      .addFields(
        {name:'Bugun',value:`${today_r[0]?.reports_checked||0}`,inline:true},
        {name:'Haftalik',value:`${week_r[0]?.total||0}`,inline:true},
      )
    await replyEmbed(embed)
    return
  }

  // ─── REPORTALL [5+] ───
  if (cmd === 'reportall') {
    if (adminLevel < 5) { await reply(`${E.warn} Min Admin 5 kerak!`, true); return }
    if (!sitePool) { await reply(`${E.reject} DB ulangmagan`, true); return }
    const [rows] = await sitePool.query('SELECT player_name,SUM(reports_checked) as total FROM admin_activity WHERE date>=DATE_SUB(CURDATE(),INTERVAL 7 DAY) GROUP BY player_name ORDER BY total DESC LIMIT 15').catch(()=>[[]])
    const embed = new EmbedBuilder().setColor('#3B82F6').setTitle('📋 Barcha Adminlar Reportlari (Haftalik)')
    embed.setDescription(rows.length?rows.map((r,i)=>`**${i+1}.** ${r.player_name} — ${r.total||0} report`).join('\n'):"Yo'q")
    await replyEmbed(embed)
    return
  }

  // ─── BANLIST [1+] ───
  if (cmd === 'banlist') {
    const [bans] = await gamePool.query('SELECT player,admin,reason FROM ban_list ORDER BY id DESC LIMIT 10').catch(()=>[[]])
    const embed = new EmbedBuilder().setColor('#EF4444').setTitle('⛔ Ban Ro\'yxati')
    embed.setDescription(bans.length?bans.map(b=>`• **${b.player}** — ${b.reason||'?'} (${b.admin})`).join('\n'):"Yo'q")
    await replyEmbed(embed)
    return
  }

  // ─── POSTNEWS [5+] ───
  if (cmd === 'postnews') {
    if (adminLevel < 5) { await reply(`${E.warn} Min Admin 5 kerak!`, true); return }
    const joy = interaction.options.getString('joy')
    const sarlavha = interaction.options.getString('sarlavha')
    const matn = interaction.options.getString('matn')
    const channelId = joy === 'server' ? CH_SERVER_NEWS : CH_ADMIN_NEWS
    const ch = await client.channels.fetch(channelId).catch(()=>null)
    if (!ch) { await reply(`${E.reject} Kanal topilmadi!`, true); return }
    const parsedMatn = parseEmojis(matn)
    const embed = new EmbedBuilder().setColor('#7C3AED').setTitle(`📰 ${sarlavha}`).setDescription(parsedMatn).setTimestamp().setFooter({text:`Shadows RP | ${playerInfo.name}`})
    await ch.send({embeds:[embed]})
    await reply(`${E.ok} Yangilik **${joy==='server'?'Server':'Admin'}** kanaliga yuborildi!`, true)
    return
  }

  // ─── FRAKSIYA [Lider] ───
  if (cmd === 'fraksiya') {
    const teamId = interaction.options.getInteger('id')
    const myMember = playerInfo
    // Lider tekshiruv (subdivison >= 5)
    const [myData] = await gamePool.query('SELECT subdivison,team FROM accounts WHERE name=?',[playerInfo.name]).catch(()=>[[]])
    if (!myData[0] || myData[0].team !== teamId || (myData[0].subdivison||0) < 5) {
      if (adminLevel < 5) { await reply(`${E.warn} Faqat fraksiya lideri!`, true); return }
    }
    const [members] = await gamePool.query('SELECT name,level,online,totalhour,subdivison FROM accounts WHERE team=? ORDER BY subdivison DESC,level DESC',[teamId]).catch(()=>[[]])
    const tNames = {1:'Politsiya',2:'Tibbiyot',3:'Armiya',4:'SWAT',5:'FIB',6:'Sheriff',7:"Yong'inchi",8:'Mehnat',9:"Yo'l xizmati"}
    const embed = new EmbedBuilder().setColor('#7C3AED').setTitle(`🏢 ${tNames[teamId]||'Fraksiya'} (${members.length} a'zo)`)
    const desc = members.map(m=>`${m.online==1?'🟢':'⚫'} **${m.name}** | Daraja ${m.level} | Rank ${m.subdivison||0} | ${m.totalhour||0}s`).join('\n')
    embed.setDescription(desc.slice(0,2000)||"A'zo yo'q")
    await replyEmbed(embed)
    return
  }

  // ─── SETRANK [Lider] ───
  if (cmd === 'setrank') {
    const nick = interaction.options.getString('nick')
    const rank = interaction.options.getInteger('rank')
    const [myData] = await gamePool.query('SELECT subdivison,team FROM accounts WHERE name=?',[playerInfo.name]).catch(()=>[[]])
    const [targetData] = await gamePool.query('SELECT team FROM accounts WHERE name=?',[nick]).catch(()=>[[]])
    if (!myData[0] || !targetData[0] || myData[0].team !== targetData[0].team || (myData[0].subdivison||0) < 5) {
      if (adminLevel < 5) { await reply(`${E.warn} Faqat fraksiya lideri!`, true); return }
    }
    await gamePool.query('UPDATE accounts SET subdivison=? WHERE name=?',[rank,nick])
    await reply(`${E.ok} **${nick}** rank **${rank}** ga o'rnatildi!`)
    return
  }

  // ─── JAZO BUYRUQLAR ───
  // BAN
  if (cmd === 'ban') {
    const nick=interaction.options.getString('nick'), vaqt=interaction.options.getString('vaqt'), sabab=interaction.options.getString('sabab')
    const target = await getPlayer(nick)
    if (!target) { await reply(`${E.notfound} **${nick}** topilmadi!`, true); return }
    if (target.admin >= adminLevel) { await reply(`${E.reject} Bu oyinchiga jazo bera olmaysiz!`, true); return }
    await gamePool.query("INSERT INTO ban_list(player,admin,reason,date) VALUES(?,?,?,NOW()) ON DUPLICATE KEY UPDATE reason=?,admin=?",[target.name,playerInfo.name,sabab,sabab,playerInfo.name]).catch(()=>{})
    await logPunishment(playerInfo.name,target.name,'BAN',sabab,vaqt,client)
    await reply(`${E.ban} **${target.name}** banland!\nVaqt: ${vaqt} | Sabab: ${sabab}`)
    return
  }

  // UNBAN
  if (cmd === 'unban') {
    const nick=interaction.options.getString('nick')
    await gamePool.query("DELETE FROM ban_list WHERE player=?",[nick]).catch(()=>{})
    await logPunishment(playerInfo.name,nick,'UNBAN','Ban bekor qilindi',null,client)
    await reply(`${E.unban} **${nick}** ban bekor qilindi!`)
    return
  }

  // MUTE
  if (cmd === 'mute') {
    const nick=interaction.options.getString('nick'), daqiqa=interaction.options.getInteger('daqiqa'), sabab=interaction.options.getString('sabab')
    const target = await getPlayer(nick)
    if (!target) { await reply(`${E.notfound} **${nick}** topilmadi!`, true); return }
    await gamePool.query('UPDATE accounts SET mute=? WHERE name=?',[daqiqa,target.name])
    await logPunishment(playerInfo.name,target.name,'MUTE',sabab,`${daqiqa} daqiqa`,client)
    await reply(`${E.mute} **${target.name}** ${daqiqa} daqiqa mute!\nSabab: ${sabab}`)
    return
  }

  // UNMUTE
  if (cmd === 'unmute') {
    const nick=interaction.options.getString('nick')
    await gamePool.query('UPDATE accounts SET mute=0 WHERE name=?',[nick])
    await logPunishment(playerInfo.name,nick,'UNMUTE','Mute bekor',null,client)
    await reply(`${E.unmute} **${nick}** mute bekor!`)
    return
  }

  // WARN
  if (cmd === 'warn') {
    const nick=interaction.options.getString('nick'), sabab=interaction.options.getString('sabab')
    const target = await getPlayer(nick)
    if (!target) { await reply(`${E.notfound} **${nick}** topilmadi!`, true); return }
    const w=(target.warn||0)+1
    await gamePool.query('UPDATE accounts SET warn=? WHERE name=?',[w,target.name])
    await logPunishment(playerInfo.name,target.name,'WARN',sabab,null,client)
    await reply(`${E.warn} **${target.name}** warn (${w}/3)!\nSabab: ${sabab}`)
    return
  }

  // UNWARN
  if (cmd === 'unwarn') {
    const nick=interaction.options.getString('nick')
    await gamePool.query('UPDATE accounts SET warn=GREATEST(0,warn-1) WHERE name=?',[nick])
    await logPunishment(playerInfo.name,nick,'UNWARN','1 warn olindi',null,client)
    await reply(`${E.ok} **${nick}** warn olindi!`)
    return
  }

  // KICK
  if (cmd === 'kick') {
    const nick=interaction.options.getString('nick'), sabab=interaction.options.getString('sabab')
    const target = await getPlayer(nick)
    if (!target) { await reply(`${E.notfound} **${nick}** topilmadi!`, true); return }
    await logPunishment(playerInfo.name,target.name,'KICK',sabab,null,client)
    await reply(`👢 **${target.name}** kicklandi!\nSabab: ${sabab}`)
    return
  }

  // JAIL
  if (cmd === 'jail') {
    const nick=interaction.options.getString('nick'), daqiqa=interaction.options.getInteger('daqiqa'), sabab=interaction.options.getString('sabab')
    const target = await getPlayer(nick)
    if (!target) { await reply(`${E.notfound} **${nick}** topilmadi!`, true); return }
    await gamePool.query('UPDATE accounts SET jail=? WHERE name=?',[daqiqa,target.name])
    await logPunishment(playerInfo.name,target.name,'JAIL',sabab,`${daqiqa} daqiqa`,client)
    await reply(`🔒 **${target.name}** ${daqiqa} daqiqa qamoq!\nSabab: ${sabab}`)
    return
  }

  // UNJAIL
  if (cmd === 'unjail') {
    const nick=interaction.options.getString('nick')
    await gamePool.query('UPDATE accounts SET jail=0 WHERE name=?',[nick])
    await logPunishment(playerInfo.name,nick,'UNJAIL','Qamoqdan chiqarildi',null,client)
    await reply(`🔓 **${nick}** qamoqdan chiqdi!`)
    return
  }

  // OFFLINE JAZOLAR
  if (cmd === 'offban') {
    const nick=interaction.options.getString('nick'), sabab=interaction.options.getString('sabab')
    await gamePool.query("INSERT INTO ban_list(player,admin,reason,date) VALUES(?,?,?,NOW()) ON DUPLICATE KEY UPDATE reason=?,admin=?",[nick,playerInfo.name,sabab,sabab,playerInfo.name]).catch(()=>{})
    await logPunishment(playerInfo.name,nick,'OFFBAN',`[OFFLINE] ${sabab}`,null,client)
    await reply(`${E.ban} **${nick}** offline ban!\nSabab: ${sabab}`)
    return
  }

  if (cmd === 'offmute') {
    const nick=interaction.options.getString('nick'), daqiqa=interaction.options.getInteger('daqiqa'), sabab=interaction.options.getString('sabab')
    await gamePool.query('UPDATE accounts SET mute=? WHERE name=?',[daqiqa,nick])
    await logPunishment(playerInfo.name,nick,'OFFMUTE',`[OFFLINE] ${sabab}`,`${daqiqa} daqiqa`,client)
    await reply(`${E.mute} **${nick}** offline ${daqiqa} daqiqa mute!\nSabab: ${sabab}`)
    return
  }

  if (cmd === 'offwarn') {
    const nick=interaction.options.getString('nick'), sabab=interaction.options.getString('sabab')
    await gamePool.query('UPDATE accounts SET warn=warn+1 WHERE name=?',[nick])
    await logPunishment(playerInfo.name,nick,'OFFWARN',`[OFFLINE] ${sabab}`,null,client)
    await reply(`${E.warn} **${nick}** offline warn!\nSabab: ${sabab}`)
    return
  }

  if (cmd === 'offjail') {
    const nick=interaction.options.getString('nick'), daqiqa=interaction.options.getInteger('daqiqa'), sabab=interaction.options.getString('sabab')
    await gamePool.query('UPDATE accounts SET jail=? WHERE name=?',[daqiqa,nick])
    await logPunishment(playerInfo.name,nick,'OFFJAIL',`[OFFLINE] ${sabab}`,`${daqiqa} daqiqa`,client)
    await reply(`🔒 **${nick}** offline ${daqiqa} daqiqa qamoq!\nSabab: ${sabab}`)
    return
  }

  if (cmd === 'offunjail') {
    const nick=interaction.options.getString('nick')
    await gamePool.query('UPDATE accounts SET jail=0 WHERE name=?',[nick])
    await logPunishment(playerInfo.name,nick,'OFFUNJAIL','[OFFLINE] Qamoqdan chiqarildi',null,client)
    await reply(`🔓 **${nick}** offline qamoqdan chiqdi!`)
    return
  }

  // PUL [5+]
  if (cmd === 'pul') {
    if (adminLevel < 5) { await reply(`${E.warn} Min Admin 5 kerak!`, true); return }
    const nick=interaction.options.getString('nick'), miqdor=interaction.options.getInteger('miqdor')
    const target = await getPlayer(nick)
    if (!target) { await reply(`${E.notfound} **${nick}** topilmadi!`, true); return }
    await gamePool.query('UPDATE accounts SET money=money+? WHERE name=?',[miqdor,target.name])
    if (sitePool) await sitePool.query('INSERT INTO admin_logs(admin_name,action,details) VALUES(?,?,?)',[playerInfo.name,'Pul berish',`${nick} $${fmt(miqdor)}`]).catch(()=>{})
    await reply(`${E.money_give} **${target.name}** ga **$${fmt(miqdor)}** berildi!`)
    return
  }

  // OLPUL [5+]
  if (cmd === 'olpul') {
    if (adminLevel < 5) { await reply(`${E.warn} Min Admin 5 kerak!`, true); return }
    const nick=interaction.options.getString('nick'), miqdor=interaction.options.getInteger('miqdor')
    const target = await getPlayer(nick)
    if (!target) { await reply(`${E.notfound} **${nick}** topilmadi!`, true); return }
    await gamePool.query('UPDATE accounts SET money=GREATEST(0,money-?) WHERE name=?',[miqdor,target.name])
    if (sitePool) await sitePool.query('INSERT INTO admin_logs(admin_name,action,details) VALUES(?,?,?)',[playerInfo.name,'Pul olish',`${nick} $${fmt(miqdor)}`]).catch(()=>{})
    await reply(`${E.money_take} **${target.name}** dan **$${fmt(miqdor)}** olindi!`)
    return
  }

  // SETLEVEL [5+]
  if (cmd === 'setlevel') {
    if (adminLevel < 5) { await reply(`${E.warn} Min Admin 5 kerak!`, true); return }
    const nick=interaction.options.getString('nick'), daraja=interaction.options.getInteger('daraja')
    const target = await getPlayer(nick)
    if (!target) { await reply(`${E.notfound} **${nick}** topilmadi!`, true); return }
    await gamePool.query('UPDATE accounts SET level=? WHERE name=?',[Math.min(Math.max(daraja,1),100),target.name])
    if (sitePool) await sitePool.query('INSERT INTO admin_logs(admin_name,action,details) VALUES(?,?,?)',[playerInfo.name,'Daraja',`${nick} → ${daraja}`]).catch(()=>{})
    await reply(`${E.ok} **${target.name}** daraja **${daraja}**!`)
    return
  }

  // HP
  if (cmd === 'hp') {
    const nick=interaction.options.getString('nick'), miqdor=interaction.options.getInteger('miqdor')
    const target = await getPlayer(nick)
    if (!target) { await reply(`${E.notfound} **${nick}** topilmadi!`, true); return }
    await gamePool.query('UPDATE accounts SET health=? WHERE name=?',[Math.min(miqdor,100),target.name])
    await reply(`${E.ok} **${target.name}** HP **${Math.min(miqdor,100)}**!`)
    return
  }

  // HEAL
  if (cmd === 'heal') {
    const nick=interaction.options.getString('nick')
    const target = await getPlayer(nick)
    if (!target) { await reply(`${E.notfound} **${nick}** topilmadi!`, true); return }
    await gamePool.query('UPDATE accounts SET health=100 WHERE name=?',[target.name])
    await reply(`${E.ok} **${target.name}** to'liq davolandi!`)
    return
  }
})

// ═══ START ═══
async function start() {
  await initDB()
  await client.login(TOKEN).catch(e => { console.error('Bot login xatosi:', e.message); process.exit(1) })
}

start()
