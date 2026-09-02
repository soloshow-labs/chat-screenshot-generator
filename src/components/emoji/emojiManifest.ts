import wechatEmojiOrder from './wechatEmojiOrder.json'

const localImages = import.meta.glob<string>('./assets/*.png', { eager: true, query: '?url&no-inline', import: 'default' })

const stableIds: Record<string, string> = {
  微笑: 'smile', 呲牙: 'grin', 偷笑: 'giggle', 害羞: 'shy',
  调皮: 'playful', 得意: 'proud', 发呆: 'blank', 疑问: 'question',
  惊讶: 'surprised', 尴尬: 'awkward', 捂脸: 'facepalm', 破涕为笑: 'joy',
  流泪: 'tear', 大哭: 'sob', 委屈: 'wronged', 发怒: 'angry',
  亲亲: 'kiss', 白眼: 'eyeroll', 嘘: 'shush', 爱心: 'heart',
  心碎: 'broken-heart', 强: 'thumbs-up', 鼓掌: 'clap', 抱拳: 'salute',
}

export const EMOJI_MANIFEST = wechatEmojiOrder.map(name => ({
  id: stableIds[name] ?? `wechat-${name}`,
  name,
  token: `[${name}]`,
  src: localImages[`./assets/${name}.png`],
}))

export type EmojiId = typeof EMOJI_MANIFEST[number]['id']
export const EMOJI_BY_ID = new Map(EMOJI_MANIFEST.map(emoji => [emoji.id, emoji]))
export const EMOJI_BY_TOKEN = new Map(EMOJI_MANIFEST.map(emoji => [emoji.token, emoji]))
EMOJI_BY_TOKEN.set('[笑哭]', EMOJI_BY_TOKEN.get('[破涕为笑]')!)
