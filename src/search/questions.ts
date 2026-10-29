// Test questions for the search, each with the Passages it should find,
// checked by hand against the text. A Passage counts as found in any of its
// Work's Editions. `pnpm ask:check` scores the search against them, to compare
// embedding models and to catch a change that makes the search worse.

export type TestQuestion = {
  question: string
  /** Passages a full answer cites, by Work and Locator. */
  expected: { work: string; locator: string }[]
  /** Sources for the question that are not in the corpus yet, for when they are. */
  notYetInCorpus?: string[]
}

const EUTROPIUS = "eutropius/breviarium"
const SUETONIUS = "suetonius/de-vita-caesarum"
const DIO = "cassius-dio/roman-history"
const HA = "anonymous/historia-augusta"

const at = (work: string, ...locators: string[]) =>
  locators.map((locator) => ({ work, locator }))

export const TEST_QUESTIONS: TestQuestion[] = [
  {
    question:
      "What is all the information we have about the death of Gordian III?",
    expected: [
      ...at(EUTROPIUS, "9.2"),
      ...at(HA, "Three Gordians 29", "Three Gordians 30", "Three Gordians 31"),
    ],
    notYetInCorpus: [
      "Zosimus 1.18–19",
      "Aurelius Victor 27.7–8",
      "Epitome de Caesaribus 27.2",
      "Orosius 7.19.5",
      "Ammianus 23.5.7, 23.5.17",
      "Zonaras 12.17–18",
      "Shapur I, Res Gestae 3–4",
      "Festus 22",
    ],
  },
  {
    question: "What did Shapur do to Valerian?",
    expected: [
      ...at(EUTROPIUS, "9.7"),
      ...at(
        HA,
        "Two Valerians 1",
        "Two Valerians 2",
        "Two Valerians 3",
        "Two Valerians 4",
        "Two Gallieni 1",
      ),
    ],
  },
  {
    question: "How was Caligula killed?",
    expected: [
      ...at(SUETONIUS, "Caligula 58"),
      ...at(DIO, "59.29"),
      ...at(EUTROPIUS, "7.12"),
    ],
  },
  {
    question: "What happened to Varus and his legions in Germany?",
    expected: [
      ...at(SUETONIUS, "Augustus 23"),
      ...at(DIO, "56.18", "56.19", "56.20", "56.21", "56.22", "56.23"),
    ],
  },
  {
    question: "How did Caracalla die?",
    expected: [
      ...at(DIO, "79.5"),
      ...at(HA, "Caracalla 6", "Caracalla 7"),
      ...at(EUTROPIUS, "8.20"),
    ],
  },
  {
    question: "Did Commodus fight as a gladiator?",
    expected: [
      ...at(DIO, "73.17", "73.19"),
      ...at(HA, "Commodus 11", "Commodus 12"),
      ...at(EUTROPIUS, "8.15"),
    ],
  },
  {
    question: "Did Nero start the great fire of Rome?",
    expected: [
      ...at(SUETONIUS, "Nero 38"),
      ...at(DIO, "62.16", "62.17", "62.18"),
      ...at(EUTROPIUS, "7.14"),
    ],
  },
  {
    question: "How did Augustus die?",
    expected: [
      ...at(SUETONIUS, "Augustus 99", "Augustus 100"),
      ...at(DIO, "56.30"),
      ...at(EUTROPIUS, "7.8"),
    ],
  },
  {
    question: "Describe the assassination of Julius Caesar",
    expected: [
      ...at(SUETONIUS, "Julius 82"),
      ...at(DIO, "44.19"),
      ...at(EUTROPIUS, "6.25"),
    ],
  },
  {
    question: "How was Elagabalus killed and what was done with his body?",
    expected: [
      ...at(HA, "Elagabalus 17"),
      ...at(DIO, "80.20"),
      ...at(EUTROPIUS, "8.22"),
    ],
  },
  {
    question: "Who built a wall across Britain?",
    expected: [...at(HA, "Hadrian 11")],
  },
]
