![Header Image of Discord AI Chars](github/headerwide.png)

Discord AI Chars is a bot whose characters talk in a Discord channel through webhooks. The characters share one group chat and only answer when they would, remember the chat long term, and know their world from a lorebook. They run on local models through Ollama, or on the Claude API.

## Requirements

- [Node.js](https://nodejs.org/) 20.17 or newer
- [Ollama](https://ollama.com/download), for local models and for the memory search
- A [Discord bot](https://discord.com/developers/applications) in your server, with the Manage Webhooks permission and all intents enabled

## Setup

```sh
git clone https://github.com/amorrrya/discordAIChars-alt.git
cd discordAIChars-alt
npm i
```

Copy `example.env` to `.env` and fill in `BOT_TOKEN`, `CHANNEL_ID` (the channel the characters talk in) and `ADMIN_ID` (your Discord user id).

Local models:

```sh
node setup
```

Or `setup.bat` on Windows. It checks your RAM and graphics card, recommends a model, downloads it after asking and saves it in `.env`.

Claude instead: set `ANTHROPIC_API_KEY` and `BASE_MODEL=claude-opus-5-5`, then `ollama pull qwen3-embedding:4b` and set `EMBED_MODEL=qwen3-embedding:4b` for the memory search. A local model in `LOCAL_MODEL` answers while the key is empty, or always when started with `start-local.bat`. Both modes share one memory.

Start the bot with `node main`, or `start.bat` on Windows. Ctrl+C stops it after the current reply and saves everything.

## Local models

What `node setup` recommends:

| Graphics card | RAM | Model | Download | Context |
| --- | --- | --- | --- | --- |
| 24 GB | 16 GB | gemma4:31b | 20 GB | 32k |
| 16 GB | 32 GB | gemma4:26b | 19 GB | 32k |
| 12 GB | 16 GB | gemma4:12b-it-qat | 7 GB | 32k |
| 8 GB | 16 GB | gemma4:e4b | 7 GB | 16k |
| 6 GB | 8 GB | gemma4:e2b | 5 GB | 8k |
| none | 16 GB | gemma4:e4b | 7 GB | 8k |
| none | 8 GB | gemma4:e2b | 5 GB | 8k |

The memory search uses `qwen3-embedding:0.6b` on the processor.

Measured on an RTX 4080 SUPER with a Ryzen 9 7900X, per reply once the chat is loaded:

- gemma4:26b: 5 to 10 seconds
- gemma4:12b-it-qat: 4 to 8 seconds
- gemma4:e4b on the processor only: 15 to 30 seconds

`LOCAL_THINK=questions` lets a character think before answering a direct question, `true` before every reply: smarter replies, about four times slower. The director always decides without thinking. `LOCAL_CONTEXT` sets how many tokens the model reads at once. More context remembers more of the chat and needs more memory. `LOCAL_PICTURES=false` turns picture descriptions off in local mode.

Every reply sees the rules, the character sheets with real past messages of each character as voice examples, the chat, everything the lore says about the character who is speaking, and a private note with the memories and other lore that matter right now. The character writes a short plan before the message. Smaller models are less consistent and know less about the world. gemma4:e2b works, but its characters lose the thread quickly.

## Characters

1. `!create` asks for a name, a picture and the character sheet. `!prompt <name>` with a .txt file attached replaces the sheet.
2. `!join <name> <note>` adds the character to the chat. The note says how much they talk.
3. Lore goes in `lore/` as .md files, read by every character. Files starting with _ are skipped.

[examples/character.txt](examples/character.txt) and [examples/lore.md](examples/lore.md) show the format.

### Smarter characters

- Write the sheet to the character: "You are Wren Calloway from the town of Saltmarsh, texting on your phone in a Discord chat."
- One short paragraph each for who they are, how they are, what's on their mind, how they see the chat and how they talk.
- What's on their mind gives them something going on right now, which keeps them from sounding generic.
- How they talk needs concrete habits: lowercase or not, message length, words they use, emojis or none. End with "Never \*actions\* or narration, just your messages. Always stay Wren. Never say you're an AI or a bot."
- World knowledge goes in the lorebook, not the sheet. Note secrets and who knows what.
- Give every character a lore section with their name in the heading. Local models read all of it whenever that character speaks.
- Keep sheets around 300 to 600 words, local models with a small context have less room for the chat.
- A character who sends many short messages in a row says so in their sheet. Everyone else mostly sends one message.
- The `!join` note decides how often they speak, e.g. "barely talks, answers direct questions with a few words".
- Every character posts through its own webhook, and Discord allows 15 per channel. `!leave` gives a character's slot back, and `!join` brings them back later with their note, sheet and memories. When a channel is full, the bot reuses its own webhooks that no character in the chat needs, otherwise delete unused ones in the channel settings.

## Commands

`!help` lists them, `!help <command>` shows the usage and an example.
