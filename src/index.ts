import {
	ChannelType,
	Client,
	Message,
	Partials,
	TextChannel,
	VoiceChannel,
} from "discord.js"
import { PrismaClient } from "@prisma/client"
import { addSpeechEvent } from "discord-speech-recognition"
import {
	DiscordGatewayAdapterCreator,
	joinVoiceChannel,
	VoiceConnectionStatus,
} from "@discordjs/voice"
import dotnev from "dotenv"
import axios from "axios"
dotnev.config()

let TALK_THROUGH_CHANNEL: TextChannel

const TRANSLATE_URL = "https://nlp-translation.p.rapidapi.com/v1/translate"

const prisma = new PrismaClient()

const debugList: string[] = []

let bannedWords: { word: string; id: number }[] = []

let adminList: string[] = []
const logChannel = "1023197474342588416"

const bot = new Client({
	intents: [
		"Guilds",
		"GuildMessages",
		"GuildVoiceStates",
		"MessageContent",
		"DirectMessages",
	],
	partials: [Partials.Channel],
})

addSpeechEvent(bot, {
	lang: "ar-SA",
	profanityFilter: false,
})

bot.on("ready", async () => {
	console.log(`Logged in as ${bot.user?.username}`)
	console.log(`Loading banned words...`)
	await refreshBannedWords()
	await refreshAdmins()
	console.log(bannedWords)
})

bot.on("messageCreate", async (mes: Message): Promise<any> => {
	if (mes.author.bot) return
	// translate command
	if ((mes.author.id === "679348712472051715" || mes.author.id === "880830750444908545") && (mes.content === "?translate" || mes.content === "?t")) {
		// get text from the replie-to message
		const mId = mes.reference?.messageId
		if (!mId) return
		const toBeTranslated = await mes.channel.messages.fetch(mId)
		if (!toBeTranslated.content) return
		const replyMesssage = await toBeTranslated.reply("Translating..")
		const encodedParams = new URLSearchParams();
		encodedParams.append("text", toBeTranslated.content);
		encodedParams.append("to", "en");
		encodedParams.append("from", "ar");
		try {
			const options = {
				url: TRANSLATE_URL,
				method: "POST",
				data: encodedParams,
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded',
					'X-RapidAPI-Key': process.env.TRANSLATE_API_TOKEN ?? "",
					'X-RapidAPI-Host': 'nlp-translation.p.rapidapi.com'
				},
			}
			const res = await axios.request(options)
			const data = await res.data
			const reply = data.translated_text.en
			if (!reply) return replyMesssage.edit("Can't translate this.")
			return replyMesssage.edit(reply)
		} catch (err: any) {
			console.log(`Error translating ${toBeTranslated.content}: ${err.message}`)
			console.log(err)
		}
	}
	// reply to everyone
	if (mes.content.includes("@everyone"))
		return mes.channel.send(
			"https://tenor.com/view/who-pinged-me-dont-disturbed-angry-gif-13884480"
		)
	const c = mes.content
	if (!c.startsWith("?")) return
	const arr = c.split(" ")
	const command = arr.shift() ?? ""
	if (!adminList.includes(mes.author.id))
		return
	if (command.toLowerCase() === "?join") {
		if (!mes.member?.voice.channelId) return mes.reply("خش فويس اول")
		connectToChannel(mes.member.voice.channelId)
	}
	if (command.toLowerCase() === "?adminadd") {
		const user = mes?.mentions?.members?.first()
		if (!user) return mes.reply("منشن الي تبيه يصير ادمن")
		addAdmin(user.id, mes)
	}
	if (command.toLowerCase() === "?adminremove") {
		const user = mes?.mentions?.members?.first()
		if (!user) return mes.reply("منشن الادمن")
		removeAdmin(user.id, mes)
	}
	if (command.toLowerCase() === "?list") return showBannedWords(mes)
	if (command.toLowerCase() === "?add") return addBannedWord(arr.join(" "), mes)
	if (command.toLowerCase() === "?debugstart") {
		debugList.push(mes.author.id)
		return mes.reply("تمّ")
	}
	if (command.toLowerCase() === "?debugstop") {
		debugList.splice(debugList.indexOf(mes.author.id), 1)
		return mes.reply("تمّ")
	}
	if (command.toLowerCase() === "?remove")
		return removeBannedWord(arr.join(" "), mes)
	if (command.toLowerCase() === "?setroom") {
		const id = arr[0]
		const channel = bot.channels.cache.get(id)
		if (!channel || channel.type !== ChannelType.GuildText)
			return mes.reply("Channel not found.")
		TALK_THROUGH_CHANNEL = channel
		return mes.react(":ok_hand::skin-tone-3: ").catch(() => { })
	}
	if (command.toLowerCase() === "?say") {
		if (!TALK_THROUGH_CHANNEL) return mes.reply("مافي روم")
		TALK_THROUGH_CHANNEL.send(arr.join(" "))
	}
})

bot.on("speech", (msg: Message): any => {
	const c = msg.content
	if (!c) return
	if (debugList.includes(msg.author.id)) {
		const channel = bot.channels.cache.get(logChannel) as TextChannel
		return channel.send(`\`\`\`${c}\`\`\``)
	}
	if (c.includes("عبد الله")) return
	if (
		bannedWords
			.filter((w) => w.word !== "")
			.some((word) => c.includes(word.word))
	) {
		const channel = bot.channels.cache.get(logChannel) as TextChannel
		if (!channel) return console.log(`Channel ${logChannel} not found.`)
		channel.send(`${msg.author.username} قال ${c}, كلمة ممنوعة.`)
		msg.member?.voice.disconnect()
	}
})

const connectToChannel = async (cid: string) => {
	console.log("Connectng to channel...")
	const channel = (await bot.channels.fetch(cid)) as VoiceChannel
	if (!channel) return
	const connection = joinVoiceChannel({
		selfDeaf: false,
		channelId: cid,
		guildId: channel.guildId,
		adapterCreator: channel.guild
			.voiceAdapterCreator as DiscordGatewayAdapterCreator,
	})
	console.log(`Connected to ${channel.name}`)
	connection.setSpeaking(true)
	connection.on(VoiceConnectionStatus.Disconnected, (_, newState) => {
		if (newState.reason === 0) connection.rejoin()
	})
	connection.disconnect()
}

bot.login(process.env.BOT_TOKEN)

const showBannedWords = async (mes: Message) => {
	await refreshBannedWords()
	mes.reply(
		`قائمة الكلمات الممنوعة: \n${bannedWords.map((w) => w.word).join("\n")}`
	)
}

const addBannedWord = async (word: string, mes: Message) => {
	const w = await prisma.bannedWord.create({ data: { word } })
	bannedWords.push(w)
	return mes.reply(`تمّت إضافة ${word} إلى قائمة الكلمات الممنوعة.`)
}

const removeBannedWord = async (word: string, mes: Message) => {
	await refreshBannedWords()
	const w = bannedWords.find((w) => w.word === word)
	if (!w)
		return mes.reply(`الكلمة ${word} ماهي موجودة في قائمة الكلمات الممنوعة.`)
	await prisma.bannedWord.delete({ where: { id: w.id } })
	await refreshBannedWords()
	return mes.reply(`اوك تم`)
}

const refreshBannedWords = async () => {
	bannedWords = await prisma.bannedWord.findMany({})
}

const refreshAdmins = async () => {
	adminList = (await prisma.admins.findMany({})).map((a) => a.userID)
}

const addAdmin = async (id: string, mes: Message) => {
	const admin = await prisma.admins.create({ data: { userID: id } })
	adminList.push(admin.userID)
	return mes.reply(`تمّت إضافة <@${id}> إلى قائمة الأدمنز.`)
}

const removeAdmin = async (id: string, mes: Message) => {
	await refreshAdmins()
	const admin = adminList.find((a) => a === id)
	if (!admin) return mes.reply(`الشخص ماهو موجود في قائمة الأدمنز.`)
	await prisma.admins.deleteMany({ where: { userID: id } })
	await refreshAdmins()
	return mes.reply(`اوك تم`)
}

bot.on("voiceStateUpdate", (_, newState) => {
	console.log(`Voice state updated`)
	if (!newState || !newState.channelId) return
	if (newState.member?.user.id !== bot.user?.id) return
	if (newState.deaf) {
		newState.setDeaf(false)
	}
})

bot.on("messageDelete", async (m) => {
	if (!m || (m.author && m.author?.bot)) return
	console.log(`A message has been deleted!!`)
	console.log(`${m.author?.username}: ${m.content}`)
	adminList.forEach((admin) => {
		const user = bot.users.cache.get(admin)
		if (user) {
			try {
				console.log(`Sending message to ${user.username}`)
				user.send(
					{
						content: `<@${m.author?.id}> حذف الرسالة:\n ${m.content} \n في روم <#${m.channelId}>`,
						files: m.attachments.map((a) => a.url)
					}
				)
			} catch (err: any) {
				console.log(`Failed to dm ${user.username}: ${err.message}`)
			}
		}
	})
	await prisma.deletedMessages.create({
		data: {
			content: m.content ?? "",
			authorId: m.author?.username ?? "unknown",
			channelId: m.channelId,
		},
	})
})
