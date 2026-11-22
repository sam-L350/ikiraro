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
	loginSentence: "Enter the phone number your center already knows.",
	sendCode: "Send code",
	enterCode: "Enter the code we sent.",
	phoneLabel: "Phone",
	codeLabel: "Code",
	emailLabel: "Email",
	passwordLabel: "Password",
	useEmail: "Use email and password",
	usePhone: "Use a phone code",
	invalidPhone: "Enter a Rwandan phone number.",
	wrongCode: "That code is not right.",
	wrongPassword: "The email or password is wrong.",
	tooManyAttempts: "Too many attempts. Wait and try again.",
	tryAgain: "Something went wrong. Try again.",
	devCodeHint: "In development the code is written to the engine log.",
	staffLogin: "Staff can sign in with email and a password.",
	learnerTitle: "Your next task will show here.",
	learnerBody:
		"This page is the learner home. It shows who is signed in, and sign out stays one tap away on a shared computer.",
	staffTitle: "Staff tools",
	staffBody:
		"This page is for trainers and managers. Learners do not see this desk.",
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
	loginSentence: "Andika nimero ya telefoni ikigo cyawe kizi.",
	sendCode: "Ohereza kode",
	enterCode: "Andika kode twohereje.",
	phoneLabel: "Telefoni",
	codeLabel: "Kode",
	emailLabel: "Imeyili",
	passwordLabel: "Ijambobanga",
	useEmail: "Koresha imeyili n'ijambobanga",
	usePhone: "Koresha kode ya telefoni",
	invalidPhone: "Andika nimero ya telefoni y'u Rwanda.",
	wrongCode: "Iyo kode ntabwo ari yo.",
	wrongPassword: "Imeyili cyangwa ijambobanga sibyo.",
	tooManyAttempts: "Gerageza cyane. Tegereza hanyuma wongere.",
	tryAgain: "Habaye ikibazo. Ongera ugerageze.",
	devCodeHint: "Mu gihe cyo gukora, kode iri mu nyandiko z'injini.",
	staffLogin: "Abakozi binjira n'imeyili n'ijambobanga.",
	learnerTitle: "Ikazi rikurikira rizagaragara hano.",
	learnerBody:
		"Iyi paji ni iy'umunyeshuri. Erekana uwinjiye, kandi gusohoka ni intambwe imwe kuri mudasobwa rusange.",
	staffTitle: "Ibikoresho by'abakozi",
	staffBody:
		"Iyi paji ni iy'abatoza n'abayobozi. Abanyeshuri ntibabona iyi paji.",
	howItWorks: "Uko bikora",
	status: "Imimerere",
};
