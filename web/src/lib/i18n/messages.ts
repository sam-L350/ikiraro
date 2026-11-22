export const en = {
	wordmark: "Ikiraro",
	signIn: "Sign in",
	signOut: "Sign out",
	continue: "Continue",
	language: "Language",
	english: "English",
	kinyarwanda: "Kinyarwanda",
	signedInAs: "Signed in as {name}",
	centerPending: "Home center not assigned yet",
	homeEyebrow: "For learners and centers",
	homeHeadline: "Verified work. A fair share of the tools.",
	homeLead:
		"Ikiraro turns real practice in rural communities into proof a trainer has checked, then uses that proof when equipment is given out.",
	homeSplitTitle: "Evidence first. Then the allocation.",
	homeSplitBody:
		"A course is the way in. The record of what was verified, and the reason a device was awarded, are the product.",
	principleEvidenceTitle: "Evidence",
	principleEvidenceBody:
		"Nothing is credited until a person with the right authority has seen the work.",
	principleFairTitle: "A fair decision",
	principleFairBody:
		"Every award can be explained. An outsider can read who decided, and why.",
	principleOfflineTitle: "Works offline",
	principleOfflineBody:
		"A dropped connection keeps the draft. The screen says what is still waiting to send.",
	homeClose: "Sign in when you are at a center, or on a shared computer.",
	loginSentence: "Use the Google account your center already knows.",
	learnerTitle: "Your next task will show here.",
	learnerBody:
		"This page is the learner home. It shows who is signed in, and sign out stays one tap away on a shared computer.",
	staffTitle: "Staff tools",
	staffBody:
		"This page is for trainers and managers. The theme control lives in this account menu. Learners do not see it.",
	account: "Account",
	theme: "Theme",
	howItWorks: "How it works",
	status: "Status",
} as const;

export type MessageKey = keyof typeof en;

export const rw: Record<MessageKey, string> = {
	wordmark: "Ikiraro",
	signIn: "Injira",
	signOut: "Sohoka",
	continue: "Komeza",
	language: "Ururimi",
	english: "English",
	kinyarwanda: "Kinyarwanda",
	signedInAs: "Winjiye nk' {name}",
	centerPending: "Ikigo cyawe ntikirashyirwaho",
	homeEyebrow: "Ku biga no ku bigo",
	homeHeadline: "Akazi kemejwe. Ibikoresho bitangwa mu buryo bugaragara.",
	homeLead:
		"Ikiraro ihindura imirimo yo mu miryango y'icyaro ikimenyetso umutoza yasuzumye, ikakoresha icyo kimenyetso igihe ibikoresho bitangwa.",
	homeSplitTitle: "Ikimenyetso mbere. Hanyuma ugabanye.",
	homeSplitBody:
		"Isomo ni inzira. Icyo umuntu yakoze kandi cyemejwe, n'impamvu yahawe igikoresho, ni cyo gikorwa.",
	principleEvidenceTitle: "Ikimenyetso",
	principleEvidenceBody:
		"Nta kintu gikirwa kidasuzumwe n'umuntu ufite ububasha bwo kukireba.",
	principleFairTitle: "Icyemezo kigaragara",
	principleFairBody:
		"Buri gitangwa gisobanutse. Undi muntu ashobora gusoma uwacyemeje n'impamvu.",
	principleOfflineTitle: "Ikora nta murongo",
	principleOfflineBody:
		"Niba umurongo ucika, inyandiko ibika. Mugaragaza ibikiri gutegereje koherezwa.",
	homeClose: "Injira uri ku kigo, cyangwa kuri mudasobwa rusange.",
	loginSentence: "Koresha konti ya Google ikigo cyawe kizi.",
	learnerTitle: "Ikazi rikurikira rizagaragara hano.",
	learnerBody:
		"Iyi paji ni iy'umunyeshuri. Erekana uwinjiye, kandi gusohoka ni intambwe imwe kuri mudasobwa rusange.",
	staffTitle: "Ibikoresho by'abakozi",
	staffBody:
		"Iyi paji ni iy'abatoza n'abayobozi. Guhindura urumuri biri muri iri menyu. Abanyeshuri ntibabona iri menyu.",
	account: "Konti",
	theme: "Urumuri",
	howItWorks: "Uko bikora",
	status: "Imimerere",
};
