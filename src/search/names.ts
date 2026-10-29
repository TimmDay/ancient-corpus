// Names a person or place goes by across the corpus's languages and Editions:
// Magie writes "Sapor" for the king his own inscription calls Šābuhr and modern
// English calls Shapur. A keyword search for any one form looks for all of them.
// Each form is a word stem: "sapor" also finds Latin "Saporem" and "Sapori".

export type NameGroup = { name: string; forms: string[] }

export const NAMES: NameGroup[] = [
  { name: "Shapur I", forms: ["shapur", "sapor", "sabuhr", "σαπωρ"] },
  { name: "Gordian", forms: ["gordian", "γορδιαν"] },
  { name: "Philip the Arab", forms: ["philip", "philipp", "φιλιππ"] },
  { name: "Timesitheus", forms: ["timesithe", "misithe", "τιμησιθε"] },
  { name: "Misiche", forms: ["misiche", "mesiche", "μισιχ"] },
  { name: "Valerian", forms: ["valerian", "ουαλεριαν"] },
  { name: "Elagabalus", forms: ["elagabal", "heliogabal", "ελεγαβαλ"] },
  // Not "Gaius": half the Romans in the corpus are called that.
  { name: "Caligula", forms: ["caligula"] },
  { name: "Caracalla", forms: ["caracall", "bassian", "καρακαλλ"] },
  { name: "Ctesiphon", forms: ["ctesiphon", "κτησιφων"] },
]

/** Folds case and accents so `Šābuhr`, `Σαπώρης` and `SAPOR` compare alike. */
export function fold(word: string): string {
  return word.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()
}

/** Every form of the names a word could be, or just the word when it names nobody listed. */
export function variantsOf(word: string): string[] {
  const folded = fold(word)
  const group = NAMES.find((g) =>
    g.forms.some((form) => folded.startsWith(fold(form))),
  )
  return group ? group.forms.map(fold) : [folded]
}
