/* ============================================================
   core/quotes.js
   Curated daily quotes — English + Hindi/Urdu.
   - Same quote shows all day, changes at midnight (deterministic by date)
   - Language toggle, preference saved
   - Reshuffle button picks next quote in rotation
   ============================================================ */

const LANG_KEY    = 'smartapp_quote_lang_v1';   // 'en' | 'hi'
const SHUFFLE_KEY = 'smartapp_quote_shuffle_v1'; // integer offset

const QUOTES_EN = [
  { text: "The impediment to action advances action. What stands in the way becomes the way.", who: "Marcus Aurelius" },
  { text: "Out beyond ideas of wrongdoing and rightdoing, there is a field. I'll meet you there.", who: "Rumi" },
  { text: "Your time is limited, so don't waste it living someone else's life.", who: "Steve Jobs" },
  { text: "Still I rise.", who: "Maya Angelou" },
  { text: "If you can keep your head when all about you are losing theirs and blaming it on you…", who: "Rudyard Kipling" },
  { text: "Waste no more time arguing what a good person should be. Be one.", who: "Marcus Aurelius" },
  { text: "The wound is the place where the light enters you.", who: "Rumi" },
  { text: "Stay hungry. Stay foolish.", who: "Steve Jobs" },
  { text: "I can be changed by what happens to me. But I refuse to be reduced by it.", who: "Maya Angelou" },
  { text: "If you can dream — and not make dreams your master.", who: "Rudyard Kipling" },
  { text: "Confine yourself to the present.", who: "Marcus Aurelius" },
  { text: "What you seek is seeking you.", who: "Rumi" },
  { text: "The people who are crazy enough to think they can change the world are the ones who do.", who: "Steve Jobs" },
  { text: "There is no greater agony than bearing an untold story inside you.", who: "Maya Angelou" },
  { text: "Yours is the Earth and everything that's in it, and—which is more—you'll be a Man, my son!", who: "Rudyard Kipling" },
  { text: "Begin — to begin is half the work.", who: "Ausonius" },
  { text: "He who has a why to live can bear almost any how.", who: "Friedrich Nietzsche" },
  { text: "Do the hard jobs first. The easy jobs will take care of themselves.", who: "Dale Carnegie" },
  { text: "Quality is not an act, it is a habit.", who: "Aristotle" },
  { text: "Patience is bitter, but its fruit is sweet.", who: "Aristotle" },
];

const QUOTES_HI = [
  { text: "ऐसी वाणी बोलिए, मन का आपा खोय। औरन को शीतल करे, आपहु शीतल होय॥", who: "कबीर" },
  { text: "धीरे-धीरे रे मना, धीरे सब कुछ होय। माली सींचे सौ घड़ा, ऋतु आए फल होय॥", who: "कबीर" },
  { text: "साईं इतना दीजिए, जा में कुटुम्ब समाय। मैं भी भूखा न रहूँ, साधु न भूखा जाय॥", who: "कबीर" },
  { text: "बड़ा हुआ तो क्या हुआ, जैसे पेड़ खजूर। पंथी को छाया नहीं, फल लागे अति दूर॥", who: "कबीर" },
  { text: "जिन ढूँढा तिन पाइयाँ, गहरे पानी पैठ। मैं बपुरा बूड़न डरा, रहा किनारे बैठ॥", who: "कबीर" },
  { text: "हज़ारों ख़्वाहिशें ऐसी कि हर ख़्वाहिश पे दम निकले। बहुत निकले मेरे अरमान, लेकिन फिर भी कम निकले॥", who: "ग़ालिब" },
  { text: "रंजिश ही सही दिल ही दुखाने के लिए आ। आ फिर से मुझे छोड़ के जाने के लिए आ॥", who: "अहमद फ़राज़" },
  { text: "मुसाफ़िर हूँ यारों, न घर है न ठिकाना। मुझे चलते जाना है, बस चलते जाना॥", who: "गुलज़ार" },
  { text: "ज़िंदगी क्या है, ख़ुद ही सोचो ज़रा। दिल जो कह दे वो ही सही॥", who: "गुलज़ार" },
  { text: "रहिमन धागा प्रेम का, मत तोड़ो चटकाय। टूटे से फिर ना जुड़े, जुड़े गाँठ पड़ जाय॥", who: "रहीम" },
  { text: "जो तोको काँटा बुवै, ताहि बोव तू फूल। तोको फूल के फूल हैं, वाको है तिरशूल॥", who: "कबीर" },
  { text: "होइहै सोइ जो राम रचि राखा, को करि तर्क बढ़ावै साखा।", who: "तुलसीदास" },
  { text: "करत-करत अभ्यास के, जड़मति होत सुजान। रसरी आवत-जात ते, सिल पर पड़त निसान॥", who: "वृंद" },
  { text: "बड़े बड़ाई ना करें, बड़े न बोलें बोल। हीरा मुख से ना कहे, लाख हमारा मोल॥", who: "कबीर" },
  { text: "दुख में सुमिरन सब करें, सुख में करै न कोय। जो सुख में सुमिरन करे, दुख काहे को होय॥", who: "कबीर" },
  { text: "कोशिश करने वालों की कभी हार नहीं होती।", who: "हरिवंशराय बच्चन" },
  { text: "मन के हारे हार है, मन के जीते जीत।", who: "लोकोक्ति" },
  { text: "अब के हम बिछड़े तो शायद कभी ख़्वाबों में मिलें। जिस तरह सूखे हुए फूल किताबों में मिलें॥", who: "अहमद फ़राज़" },
  { text: "ज़िंदगी एक सफ़र है सुहाना, यहाँ कल क्या हो किसने जाना।", who: "लोकगीत" },
  { text: "तू ज़िंदा है तो ज़िंदगी की जीत में यकीन कर। अगर कहीं हैं स्वर्ग तो उतार ला ज़मीन पर॥", who: "शैलेंद्र" },
];

export function getLang() {
  try { return localStorage.getItem(LANG_KEY) || 'en'; }
  catch { return 'en'; }
}
export function setLang(lang) {
  try { localStorage.setItem(LANG_KEY, lang === 'hi' ? 'hi' : 'en'); } catch {}
}

function getShuffle() {
  try { return parseInt(localStorage.getItem(SHUFFLE_KEY) || '0', 10) || 0; }
  catch { return 0; }
}
export function bumpShuffle() {
  try { localStorage.setItem(SHUFFLE_KEY, String(getShuffle() + 1)); } catch {}
}

/** Returns the same quote all day (changes at midnight local), with shuffle offset. */
export function getDailyQuote() {
  const lang = getLang();
  const pool = lang === 'hi' ? QUOTES_HI : QUOTES_EN;
  // Day-of-year as the deterministic index
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const day = Math.floor((now - start) / 86400000);
  const idx = (day + getShuffle()) % pool.length;
  return { ...pool[idx], lang, idx, total: pool.length };
}
