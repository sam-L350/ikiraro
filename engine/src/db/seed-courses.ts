import { createHash } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { env } from "../config/env";
import {
	createCourse,
	createCriterion,
	createModule,
	createTask,
	type EvidenceType,
	saveBadge,
	submitCourseForReview,
	updateModule,
} from "../core/content/author";
import { approveCourse, publishCourse } from "../core/content/review";
import { enrollInCourse } from "../core/learning/catalog";
import { getObjectStore } from "../core/storage/object-store";
import { db } from "./index";
import {
	badges,
	contentVersions,
	courses,
	courseTranslations,
	enrollments,
	mediaObjects,
	modulePrerequisites,
	modules,
	moduleTranslations,
	rubricCriteria,
	taskSubmissions,
	tasks,
	taskTranslations,
	users,
} from "./schema";
import { lessonPdf, lessonPicture, type PictureScene } from "./seed-media";

const SEED_IP = "127.0.0.1";

type CriterionSeed = {
	weight: number;
	passThreshold: number;
	promptEn: string;
	promptRw: string;
};

type TaskSeed = {
	titleEn: string;
	titleRw: string;
	instructionsEn: string;
	instructionsRw: string;
	evidenceType: EvidenceType;
	passThreshold: number;
	scene: PictureScene;
	outboundUrl?: string;
	jobAid?: readonly string[];
	criteria: readonly CriterionSeed[];
};

type ModuleSeed = {
	titleEn: string;
	titleRw: string;
	summaryEn: string;
	summaryRw: string;
	tasks: readonly TaskSeed[];
};

type CourseSeed = {
	titleEn: string;
	titleRw: string;
	summaryEn: string;
	summaryRw: string;
	category: string;
	economicSector: string;
	level: number;
	publish: boolean;
	badge: {
		titleEn: string;
		titleRw: string;
		skillEn: string;
		skillRw: string;
		level: number;
		validDays: number;
	} | null;
	modules: readonly ModuleSeed[];
};

const COURSES: readonly CourseSeed[] = [
	{
		titleEn: "Run a small shop",
		titleRw: "Cunga iduka rito",
		summaryEn:
			"Count what is on the shelf, write every sale, and close the day with a number you can check.",
		summaryRw:
			"Bara ibiri ku kabati, andika buri igurisha, hanyuma usoze umunsi ufite umubare ushobora kugenzura.",
		category: "Shop",
		economicSector: "Trade",
		level: 1,
		publish: true,
		badge: {
			titleEn: "Shop day",
			titleRw: "Umunsi w'iduka",
			skillEn: "Count stock, record a sale, and close the cash.",
			skillRw: "Bara ibicuruzwa, andika igurisha, usoze amafaranga.",
			level: 1,
			validDays: 365,
		},
		modules: [
			{
				titleEn: "Open the shop",
				titleRw: "Fungura iduka",
				summaryEn: "Know what you have and how much cash you start with.",
				summaryRw: "Menya ibyo ufite n'amafaranga utangiranye.",
				tasks: [
					{
						titleEn: "Count the shelf",
						titleRw: "Bara ibiri ku kabati",
						instructionsEn:
							"Stand in front of one shelf. Count each kind of item. Write the name and the number on paper, then take a photo of that shelf in daylight. The photo should show the goods, not a person's face.",
						instructionsRw:
							"Hagarara imbere y'akabati kamwe. Bara buri bwoko. Andika izina n'umubare ku rupapuro, hanyuma ufate ifoto y'ako kabati ku manywa. Ifoto igaragaze ibicuruzwa, ntabwo igaragaza isura y'umuntu.",
						evidenceType: "photo",
						passThreshold: 70,
						scene: "shop",
						criteria: [
							{
								weight: 2,
								passThreshold: 70,
								promptEn:
									"The count names each kind of item and gives a number.",
								promptRw: "Ibarura rivuga buri bwoko kandi ritanga umubare.",
							},
							{
								weight: 1,
								passThreshold: 70,
								promptEn: "The photo shows the shelf clearly.",
								promptRw: "Ifoto igaragaza akabati neza.",
							},
						],
					},
					{
						titleEn: "Write the opening cash",
						titleRw: "Andika amafaranga yo gutangira",
						instructionsEn:
							"Count the notes and coins in the tin before the first customer. Write the total in francs, and write the date. Do not write a customer's name.",
						instructionsRw:
							"Bara amapapuro n'ibiceri biri mu gikopo mbere y'umukiriya wa mbere. Andika umubare wose mu mafaranga n'itariki. Ntukandike izina ry'umukiriya.",
						evidenceType: "note",
						passThreshold: 80,
						scene: "shop",
						criteria: [
							{
								weight: 1,
								passThreshold: 80,
								promptEn: "The note has a total and a date.",
								promptRw: "Inyandiko ifite umubare wose n'itariki.",
							},
						],
					},
				],
			},
			{
				titleEn: "Serve one customer",
				titleRw: "Fasha umukiriya umwe",
				summaryEn: "Write one sale so the shelf and the tin still agree.",
				summaryRw:
					"Andika igurisha rimwe kugira ngo akabati n'igikopo bikomeze guhurira.",
				tasks: [
					{
						titleEn: "Record a sale",
						titleRw: "Andika igurisha",
						instructionsEn:
							"When you sell one item, write what it was, how many, the price, and the money you received. Keep the customer's name off the page.",
						instructionsRw:
							"Niba uguze ikintu kimwe, andika icyo cyari, ingano, igiciro, n'amafaranga wakiriye. Ntukandike izina ry'umukiriya.",
						evidenceType: "note",
						passThreshold: 70,
						scene: "shop",
						criteria: [
							{
								weight: 2,
								passThreshold: 70,
								promptEn: "The note has the item, the quantity, and the price.",
								promptRw: "Inyandiko ifite ikintu, ingano, n'igiciro.",
							},
						],
					},
					{
						titleEn: "Photograph the goods you sold",
						titleRw: "Fata ifoto y'ibyo waguze",
						instructionsEn:
							"Take one photo of the kind of item you sold, still on the shelf or in your hand. Use the job aid if you are not sure what to include. Do not photograph money that shows a serial number up close, and do not photograph a person.",
						instructionsRw:
							"Fata ifoto imwe y'ubwoko waguze, kikiri ku kabati cyangwa mu ntoki. Koresha ifishi niba utizeye ibyo ushyiramo. Ntufate ifoto y'amafaranga agaragaza nomero hafi, kandi ntufate ifoto y'umuntu.",
						evidenceType: "photo",
						passThreshold: 70,
						scene: "shop",
						jobAid: [
							"Shop day job aid",
							"1. Name the item.",
							"2. Write how many left the shelf.",
							"3. Write the price you asked.",
							"4. Write the money you received.",
							"5. Photo the goods, not a person.",
						],
						criteria: [
							{
								weight: 1,
								passThreshold: 70,
								promptEn: "The photo matches the item named in the sale.",
								promptRw: "Ifoto ihuye n'ikintu cyanditswe mu gurisha.",
							},
						],
					},
				],
			},
			{
				titleEn: "Close the day",
				titleRw: "Soza umunsi",
				summaryEn: "Check the tin against the page before you lock up.",
				summaryRw:
					"Genzura igikopo ukigerekanije n'urupapuro mbere yo gufunga.",
				tasks: [
					{
						titleEn: "Compare the tin and the page",
						titleRw: "Gereranya igikopo n'urupapuro",
						instructionsEn:
							"Add the opening cash and today's sales. Count the tin again. Write both numbers. If they differ, write the difference and one sentence about why.",
						instructionsRw:
							"Huza amafaranga yo gutangira n'igurisha ry'uyu munsi. Ongera ubare igikopo. Andika imibare yombi. Niba itandukanye, andika itandukaniro n'interuro imwe ivuga impamvu.",
						evidenceType: "note",
						passThreshold: 80,
						scene: "notebook",
						criteria: [
							{
								weight: 2,
								passThreshold: 80,
								promptEn:
									"Both numbers are written, and a difference is explained.",
								promptRw:
									"Imibare yombi yanditswe, kandi itandukaniro risobanuye.",
							},
						],
					},
					{
						titleEn: "Write what to buy tomorrow",
						titleRw: "Andika ibyo uzagura ejo",
						instructionsEn:
							"Look at what is almost gone. Write up to three items you need to buy, and a number for each. This is your list, not a promise to a supplier.",
						instructionsRw:
							"Reba ibyo hasigaye bike. Andika ibintu bitarenze bitatu ukeneye kugura, n'umubare kuri buri kimwe. Iyi ni lisiti yawe, si isezerano ku mugurisha.",
						evidenceType: "note",
						passThreshold: 70,
						scene: "notebook",
						criteria: [
							{
								weight: 1,
								passThreshold: 70,
								promptEn: "The list names items and a number for each.",
								promptRw: "Lisiti ivuga ibintu n'umubare kuri buri kimwe.",
							},
						],
					},
				],
			},
		],
	},
	{
		titleEn: "Plan a growing season",
		titleRw: "Tegura igihembwe cyo gutera",
		summaryEn:
			"Look at the plot, choose a crop, and write the week you will plant and the week you will check.",
		summaryRw:
			"Reba umurima, hitamo igihingwa, hanyuma wandike icyumweru uzatera n'icyumweru uzagenzura.",
		category: "Growing",
		economicSector: "Agriculture",
		level: 1,
		publish: true,
		badge: {
			titleEn: "Season plan",
			titleRw: "Gahunda y'igihembwe",
			skillEn: "Record a plot, a crop, and the weeks you will tend it.",
			skillRw: "Andika umurima, igihingwa, n'ibyumweru uzagirire.",
			level: 1,
			validDays: 365,
		},
		modules: [
			{
				titleEn: "Choose the plot",
				titleRw: "Hitamo umurima",
				summaryEn: "Show the place and what happened there last time.",
				summaryRw: "Erekana ahantu n'ibyo byabayeho ubushize.",
				tasks: [
					{
						titleEn: "Photograph the plot",
						titleRw: "Fata ifoto y'umurima",
						instructionsEn:
							"Take one photo of the ground you will use. Include a path or a wall so the place is recognizable. Do not include people.",
						instructionsRw:
							"Fata ifoto imwe y'ubutaka uzakoresha. Shyiramo inzira cyangwa urukuta kugira ngo ahantu hazwe. Ntushyiremo abantu.",
						evidenceType: "photo",
						passThreshold: 70,
						scene: "garden",
						criteria: [
							{
								weight: 1,
								passThreshold: 70,
								promptEn: "The photo shows soil and a landmark.",
								promptRw: "Ifoto igaragaza ubutaka n'ikimenyetso cy'ahantu.",
							},
						],
					},
					{
						titleEn: "Write last season",
						titleRw: "Andika igihembwe cyashize",
						instructionsEn:
							"Write what grew there last time, and one problem you remember, such as rain, pests, or thin soil. If nothing grew, write that.",
						instructionsRw:
							"Andika ibyo byariyeho ubushize, n'ikibazo kimwe wibuka, nk'imvura, udukoko, cyangwa ubutaka bworoshye. Niba ntacyo cyariye, byandike.",
						evidenceType: "note",
						passThreshold: 70,
						scene: "garden",
						criteria: [
							{
								weight: 1,
								passThreshold: 70,
								promptEn:
									"The note says what grew and names one problem or says nothing grew.",
								promptRw:
									"Inyandiko ivuga ibyo byariye kandi ivuga ikibazo kimwe cyangwa ko ntacyo cyariye.",
							},
						],
					},
				],
			},
			{
				titleEn: "Prepare and plant",
				titleRw: "Tegura uterere",
				summaryEn: "Write the crop and the day you put seed in the ground.",
				summaryRw: "Andika igihingwa n'umunsi washyiriyemo imbuto.",
				tasks: [
					{
						titleEn: "Photograph the beds",
						titleRw: "Fata ifoto y'imirima",
						instructionsEn:
							"After you prepare the beds, take a photo that shows the rows. Stand so the rows run away from you.",
						instructionsRw:
							"Nyuma yo gutegura imirima, fata ifoto igaragaza imirongo. Hagarara imirongo igana kure yawe.",
						evidenceType: "photo",
						passThreshold: 70,
						scene: "garden",
						criteria: [
							{
								weight: 1,
								passThreshold: 70,
								promptEn: "The photo shows prepared rows.",
								promptRw: "Ifoto igaragaza imirongo iteguwe.",
							},
						],
					},
					{
						titleEn: "Write the planting day",
						titleRw: "Andika umunsi wo gutera",
						instructionsEn:
							"Write the crop, the date you planted, and how many rows. Use the job aid so the page has all three.",
						instructionsRw:
							"Andika igihingwa, itariki wateraga, n'imirongo ingahe. Koresha ifishi kugira ngo urupapuro ruzane ibyo bitatu.",
						evidenceType: "note",
						passThreshold: 80,
						scene: "notebook",
						jobAid: [
							"Planting day job aid",
							"1. Write the crop.",
							"2. Write the date.",
							"3. Write the number of rows.",
							"4. Keep seed packets, if you have them, with the notebook.",
						],
						criteria: [
							{
								weight: 2,
								passThreshold: 80,
								promptEn:
									"The note has the crop, the date, and the number of rows.",
								promptRw:
									"Inyandiko ifite igihingwa, itariki, n'umubare w'imirongo.",
							},
						],
					},
				],
			},
			{
				titleEn: "Water and watch",
				titleRw: "Vomereza urebe",
				summaryEn: "Check the plants after one week and write the next action.",
				summaryRw:
					"Genzura ibimera nyuma y'icyumweru kimwe, hanyuma wandike igikorwa gikurikira.",
				tasks: [
					{
						titleEn: "Photograph the plants",
						titleRw: "Fata ifoto y'ibimera",
						instructionsEn:
							"One week after planting, photograph the same beds. Show whether seedlings are up.",
						instructionsRw:
							"Nyuma y'icyumweru kimwe wo gutera, fata ifoto y'iyo mirima. Erekana niba imbuto zameze.",
						evidenceType: "photo",
						passThreshold: 70,
						scene: "garden",
						criteria: [
							{
								weight: 1,
								passThreshold: 70,
								promptEn: "The photo is of the planted beds a week later.",
								promptRw: "Ifoto y'imirima yaterwemo nyuma y'icyumweru.",
							},
						],
					},
					{
						titleEn: "Write the next action",
						titleRw: "Andika igikorwa gikurikira",
						instructionsEn:
							"Write one thing you will do next: water, weed, thin the rows, or wait for rain. Add the day you will do it.",
						instructionsRw:
							"Andika ikintu kimwe uzakora: kuvomereza, kuvomera, kugabanya imirongo, cyangwa gutegereza imvura. Ongeraho umunsi uzabikora.",
						evidenceType: "note",
						passThreshold: 70,
						scene: "garden",
						criteria: [
							{
								weight: 1,
								passThreshold: 70,
								promptEn: "The note names one action and a day.",
								promptRw: "Inyandiko ivuga igikorwa kimwe n'umunsi.",
							},
						],
					},
				],
			},
		],
	},
	{
		titleEn: "Use a phone for work",
		titleRw: "Koresha telefoni mu kazi",
		summaryEn:
			"Save a work contact, take a clear photo of a thing, and find one public service on Irembo.",
		summaryRw:
			"Bika umuntu ukorana, fata ifoto isobanutse y'ikintu, hanyuma ushake serivisi imwe rusange kuri Irembo.",
		category: "Phone",
		economicSector: "Services",
		level: 1,
		publish: true,
		badge: {
			titleEn: "Phone for work",
			titleRw: "Telefoni y'akazi",
			skillEn:
				"Save a contact, take a clear photo, and open a public service page.",
			skillRw: "Bika umuntu, fata ifoto isobanutse, ufungure serivisi rusange.",
			level: 1,
			validDays: 365,
		},
		modules: [
			{
				titleEn: "Keep the phone ready",
				titleRw: "Tegura telefoni",
				summaryEn:
					"Know who you can call for work, without sharing their private life.",
				summaryRw:
					"Menya uwo wahamagara ku kazi, utagaragaza ubuzima bwe bwite.",
				tasks: [
					{
						titleEn: "Write one work contact",
						titleRw: "Andika umuntu umwe ukorana",
						instructionsEn:
							"Write the first name of one person you work with and the reason you would call them, such as a supplier or a trainer. You do not need to write the full phone number in this note.",
						instructionsRw:
							"Andika izina ry'umuntu umwe ukorana n'impamvu wamuhamagara, nk'uwaguha ibicuruzwa cyangwa umutoza. Ntabwo ukeneye kwandika nomero yose muri iyi nyandiko.",
						evidenceType: "note",
						passThreshold: 70,
						scene: "phone",
						criteria: [
							{
								weight: 1,
								passThreshold: 70,
								promptEn: "The note has a first name and a work reason.",
								promptRw: "Inyandiko ifite izina n'impamvu y'akazi.",
							},
						],
					},
					{
						titleEn: "Photograph a saved contact",
						titleRw: "Fata ifoto y'umuntu wabitswe",
						instructionsEn:
							"Open the contact and take a photo of the screen. Cover the phone number with your finger or a piece of paper before you shoot. The name may show. Nothing else private should show.",
						instructionsRw:
							"Fungura uwo muntu ufate ifoto ya ecran. Fuka nomero ya telefoni n'urutoki cyangwa urupapuro mbere yo gufata. Izina rishobora kugaragara. Ikindi cyose cy'ibanga ntikigomba kugaragara.",
						evidenceType: "photo",
						passThreshold: 80,
						scene: "phone",
						criteria: [
							{
								weight: 2,
								passThreshold: 80,
								promptEn: "A name is visible and the phone number is covered.",
								promptRw: "Izina rigaragara kandi nomero ya telefoni ifuwe.",
							},
						],
					},
				],
			},
			{
				titleEn: "Take a clear photo",
				titleRw: "Fata ifoto isobanutse",
				summaryEn: "A photo you can use as proof of work.",
				summaryRw: "Ifoto ushobora gukoresha nk'ikimenyetso cy'akazi.",
				tasks: [
					{
						titleEn: "Photograph a tool or a product",
						titleRw: "Fata ifoto y'igikoresho cyangwa igicuruzwa",
						instructionsEn:
							"In daylight, photograph one tool or one product you use for work. Fill most of the frame with the object. Wipe the lens first.",
						instructionsRw:
							"Ku manywa, fata ifoto y'igikoresho kimwe cyangwa igicuruzwa kimwe ukoresha ku kazi. Kintu kigumye hafi ya ecran yose. Banza usukure icyerekezo.",
						evidenceType: "photo",
						passThreshold: 70,
						scene: "phone",
						criteria: [
							{
								weight: 1,
								passThreshold: 70,
								promptEn:
									"The object is large in the frame and lit by daylight.",
								promptRw:
									"Ikintu kinini muri ecran kandi cyumurijwe n'amanywa.",
							},
						],
					},
					{
						titleEn: "Write what the photo shows",
						titleRw: "Andika icyo ifoto igaragaza",
						instructionsEn:
							"Write one sentence: what the object is and what you use it for. Match the sentence to the photo.",
						instructionsRw:
							"Andika interuro imwe: icyo ikintu ari cyo n'icyo ukikoresha. Interuro igomba guhura n'ifoto.",
						evidenceType: "note",
						passThreshold: 70,
						scene: "phone",
						criteria: [
							{
								weight: 1,
								passThreshold: 70,
								promptEn: "The sentence names the object and its use.",
								promptRw: "Interuro ivuga ikintu n'icyo gikoreshwa.",
							},
						],
					},
				],
			},
			{
				titleEn: "Open a public service",
				titleRw: "Fungura serivisi rusange",
				summaryEn:
					"Find a service on Irembo and write which one you looked at.",
				summaryRw: "Shaka serivisi kuri Irembo hanyuma wandike iyo warebye.",
				tasks: [
					{
						titleEn: "Find one Irembo service",
						titleRw: "Shaka serivisi imwe ya Irembo",
						instructionsEn:
							"Open the public Irembo site. Find one service a household might use, such as a birth record or a certificate. Write the name of the service and one sentence about who it is for. Do not enter your own identity number, and do not type a password.",
						instructionsRw:
							"Fungura urubuga rusange rwa Irembo. Shaka serivisi imwe urugo rwakoresha, nk'inyandiko y'amavuko cyangwa icyemezo. Andika izina rya serivisi n'interuro imwe ivuga uwo igeneye. Ntwinjize nomero y'irangamuntu yawe, kandi ntukandike ijambo ry'ibanga.",
						evidenceType: "note",
						passThreshold: 70,
						scene: "phone",
						outboundUrl: "https://irembo.gov.rw/",
						jobAid: [
							"Irembo visit job aid",
							"1. Open irembo.gov.rw.",
							"2. Pick one household service.",
							"3. Read the name of the service.",
							"4. Write who it is for.",
							"5. Do not type an identity number or a password.",
						],
						criteria: [
							{
								weight: 2,
								passThreshold: 70,
								promptEn:
									"The note names a service and who it is for, with no identity number.",
								promptRw:
									"Inyandiko ivuga serivisi n'uwo igeneye, nta nomero y'irangamuntu.",
							},
						],
					},
					{
						titleEn: "Save the steps you used",
						titleRw: "Bika intambwe wakoresheje",
						instructionsEn:
							"Write the steps you clicked, in order, so you could open the same service again on a shared phone. Stop before any page that asks for an identity number.",
						instructionsRw:
							"Andika intambwe wakanditse, ukurikije uko zikurikirana, kugira ngo ushobore kongera gufungura iyo serivisi kuri telefoni musangiye. Hagarara mbere y'urupapuro rusaba nomero y'irangamuntu.",
						evidenceType: "file",
						passThreshold: 70,
						scene: "notebook",
						criteria: [
							{
								weight: 1,
								passThreshold: 70,
								promptEn:
									"The steps are in order and stop before an identity page.",
								promptRw:
									"Intambwe zikurikirana kandi zihagara mbere y'urupapuro rw'irangamuntu.",
							},
						],
					},
				],
			},
		],
	},
	{
		titleEn: "Keep a household record",
		titleRw: "Andika amafaranga y'urugo",
		summaryEn:
			"Write money in and money out for one week, then choose one cost to reduce.",
		summaryRw:
			"Andika amafaranga yinjiye n'ayasohotse mu cyumweru kimwe, hanyuma uhitamo igiciro kimwe cyo kugabanya.",
		category: "Records",
		economicSector: "Household",
		level: 2,
		publish: true,
		badge: {
			titleEn: "Household record",
			titleRw: "Inyandiko y'urugo",
			skillEn: "Record a week of income and costs, then name one change.",
			skillRw:
				"Andika amafaranga n'ibiciro by'icyumweru, hanyuma uvuge impinduka imwe.",
			level: 2,
			validDays: 365,
		},
		modules: [
			{
				titleEn: "Start the notebook",
				titleRw: "Tangira ikaye",
				summaryEn: "Give the page headings before you write amounts.",
				summaryRw: "Ha urupapuro imitwe mbere yo kwandika imibare.",
				tasks: [
					{
						titleEn: "Photograph the headings",
						titleRw: "Fata ifoto y'imitwe",
						instructionsEn:
							"Draw four columns: date, item, money in, money out. Photograph the empty page so the headings can be read.",
						instructionsRw:
							"Shushanya imirongo ine: itariki, ikintu, amafaranga yinjiye, amafaranga asohotse. Fata ifoto y'urupapuro rwuzuyeho imitwe gusa, isomeka.",
						evidenceType: "photo",
						passThreshold: 70,
						scene: "notebook",
						criteria: [
							{
								weight: 1,
								passThreshold: 70,
								promptEn: "The photo shows the four headings.",
								promptRw: "Ifoto igaragaza imitwe ine.",
							},
						],
					},
					{
						titleEn: "Write yesterday's spending",
						titleRw: "Andika ibyo wakoresheje ejo",
						instructionsEn:
							"Write at least two amounts that left the house yesterday. Each line needs a date, an item, and a number in the money-out column.",
						instructionsRw:
							"Andika byibuze imibare ibiri yasohotse mu rugo ejo. Buri murongo ukeneye itariki, ikintu, n'umubare mu murongo w'amafaranga asohotse.",
						evidenceType: "note",
						passThreshold: 70,
						scene: "notebook",
						criteria: [
							{
								weight: 1,
								passThreshold: 70,
								promptEn:
									"Two lines each have a date, an item, and an amount out.",
								promptRw:
									"Imirongo ibiri ifite itariki, ikintu, n'umubare wasohotse.",
							},
						],
					},
				],
			},
			{
				titleEn: "One week of money",
				titleRw: "Icyumweru cy'amafaranga",
				summaryEn: "Add the week and see which side is larger.",
				summaryRw: "Huza icyumweru urebe uruhande runini.",
				tasks: [
					{
						titleEn: "Write the week's income",
						titleRw: "Andika amafaranga y'icyumweru",
						instructionsEn:
							"List money that came in this week: pay, a sale, or a gift you choose to record. Write the source in your own words. Add the total.",
						instructionsRw:
							"Andika amafaranga yinjiye muri iki cyumweru: umushahara, igurisha, cyangwa impano uhisemo kwandika. Andika inkomoko mu magambo yawe. Ongeraho umubare wose.",
						evidenceType: "note",
						passThreshold: 70,
						scene: "notebook",
						criteria: [
							{
								weight: 1,
								passThreshold: 70,
								promptEn: "Income lines have a source and the total is added.",
								promptRw:
									"Imirongo y'amafaranga yinjiye ifite inkomoko kandi umubare wose wahujwe.",
							},
						],
					},
					{
						titleEn: "Write the week's costs",
						titleRw: "Andika ibiciro by'icyumweru",
						instructionsEn:
							"List money that went out. Group food together if you want. Add the total and write whether income or costs were larger. Use the job aid.",
						instructionsRw:
							"Andika amafaranga asohotse. Ushobora gushyira ibiryo hamwe. Huza umubare wose wandike niba amafaranga yinjiye cyangwa asohotse ari menshi. Koresha ifishi.",
						evidenceType: "note",
						passThreshold: 80,
						scene: "notebook",
						jobAid: [
							"Week record job aid",
							"1. List money in. Add it.",
							"2. List money out. Add it.",
							"3. Write which total is larger.",
							"4. Circle one cost you can reduce.",
						],
						criteria: [
							{
								weight: 2,
								passThreshold: 80,
								promptEn: "Costs are totaled and compared with income.",
								promptRw:
									"Ibiciro byahujwe kandi bigereranyijwe n'amafaranga yinjiye.",
							},
						],
					},
				],
			},
			{
				titleEn: "Choose one change",
				titleRw: "Hitamo impinduka imwe",
				summaryEn: "Pick a single cost and write what you will do next week.",
				summaryRw:
					"Hitamo igiciro kimwe wandike icyo uzakora mu cyumweru gitaha.",
				tasks: [
					{
						titleEn: "Name the cost you will reduce",
						titleRw: "Vuga igiciro uzagabanya",
						instructionsEn:
							"Choose one line from the costs. Write what you will do differently next week, and the amount you hope to keep.",
						instructionsRw:
							"Hitamo umurongo umwe mu biciro. Andika icyo uzahindura mu cyumweru gitaha, n'umubare wifuriza kubika.",
						evidenceType: "note",
						passThreshold: 70,
						scene: "notebook",
						criteria: [
							{
								weight: 1,
								passThreshold: 70,
								promptEn: "One cost is named, with a next step and an amount.",
								promptRw:
									"Igiciro kimwe cyavuzwe, hamwe n'intambwe ikurikira n'umubare.",
							},
						],
					},
					{
						titleEn: "Photograph the decision page",
						titleRw: "Fata ifoto y'urupapuro rw'icyemezo",
						instructionsEn:
							"Photograph the page that shows the week totals and the one change. Cover any name that is not your own.",
						instructionsRw:
							"Fata ifoto y'urupapuro rugaragaza imibare y'icyumweru n'impinduka imwe. Fuka izina iryo ari ryo ryose ritari iryawe.",
						evidenceType: "photo",
						passThreshold: 70,
						scene: "notebook",
						criteria: [
							{
								weight: 1,
								passThreshold: 70,
								promptEn: "The photo shows totals and one written change.",
								promptRw: "Ifoto igaragaza imibare n'impinduka imwe yanditswe.",
							},
						],
					},
				],
			},
		],
	},
	{
		titleEn: "Mend a bicycle",
		titleRw: "Kosora igare",
		summaryEn:
			"A draft for the author to finish: check the bicycle, then fix one simple fault.",
		summaryRw:
			"Inyandiko idakora kugira ngo umwanditsi ayirangize: genzura igare, hanyuma ukosore ikibazo kimwe cyoroshye.",
		category: "Repair",
		economicSector: "Services",
		level: 1,
		publish: false,
		badge: null,
		modules: [
			{
				titleEn: "Look before you turn a bolt",
				titleRw: "Reba mbere yo guhindura ikinyabiziga",
				summaryEn: "Name what is wrong before you take anything apart.",
				summaryRw: "Vuga ikitameze neza mbere yo gutandukanya ikintu.",
				tasks: [
					{
						titleEn: "Photograph the bicycle",
						titleRw: "Fata ifoto y'igare",
						instructionsEn:
							"Photograph the whole bicycle from the side, in daylight. Point to the part you think is wrong with a finger at the edge of the frame, not covering it.",
						instructionsRw:
							"Fata ifoto y'igare ryose uruhande, ku manywa. Erekana igice utekereza ko kitameze neza n'urutoki ku ruhande, utarufuke.",
						evidenceType: "photo",
						passThreshold: 70,
						scene: "bicycle",
						criteria: [
							{
								weight: 1,
								passThreshold: 70,
								promptEn:
									"The whole bicycle is visible and one part is indicated.",
								promptRw:
									"Igare ryose rigaragara kandi igice kimwe cyerekanwe.",
							},
						],
					},
					{
						titleEn: "Write the fault",
						titleRw: "Andika ikibazo",
						instructionsEn:
							"Write what the bicycle does now, such as a soft tire, a loose brake, or a slipping chain. Write what 'fixed' will look like.",
						instructionsRw:
							"Andika icyo igare rikora ubu, nk'ipine yoroshye, ifuremu itajyanye, cyangwa urunyerezo rupunyuka. Andika icyo 'byakosorotse' bizasa nka byo.",
						evidenceType: "note",
						passThreshold: 70,
						scene: "bicycle",
						criteria: [
							{
								weight: 1,
								passThreshold: 70,
								promptEn: "The note names the fault and what fixed looks like.",
								promptRw: "Inyandiko ivuga ikibazo n'icyo byakosorotse bisa.",
							},
						],
					},
				],
			},
			{
				titleEn: "Fix one thing",
				titleRw: "Kosora ikintu kimwe",
				summaryEn: "Do the smallest repair and show the result.",
				summaryRw: "Kora isana ntoya hanyuma werekane umusaruro.",
				tasks: [
					{
						titleEn: "Write the steps you took",
						titleRw: "Andika intambwe wakoze",
						instructionsEn:
							"Write the tools you used and the steps, in order. Stop if you need a part you do not have, and write that.",
						instructionsRw:
							"Andika ibikoresho wakoresheje n'intambwe, ukurikije uko zikurikirana. Hagarara niba ukeneye igice udafite, ubyandike.",
						evidenceType: "note",
						passThreshold: 70,
						scene: "bicycle",
						criteria: [
							{
								weight: 1,
								passThreshold: 70,
								promptEn: "Tools and steps are listed in order.",
								promptRw: "Ibikoresho n'intambwe byanditswe uko bikurikirana.",
							},
						],
					},
					{
						titleEn: "Photograph the result",
						titleRw: "Fata ifoto y'umusaruro",
						instructionsEn:
							"Photograph the same part after the work. If you could not finish, photograph the missing part's place and say so in a caption on paper in the frame.",
						instructionsRw:
							"Fata ifoto y'icyo gice nyuma y'akazi. Niba utarangiye, fata ifoto y'aho igice kibura kiri, wandike n'interuro ku rupapuro ruri muri ifoto.",
						evidenceType: "photo",
						passThreshold: 70,
						scene: "bicycle",
						criteria: [
							{
								weight: 1,
								passThreshold: 70,
								promptEn:
									"The photo shows the part after the work, or the gap if it is unfinished.",
								promptRw:
									"Ifoto igaragaza igice nyuma y'akazi, cyangwa ahabuze niba bitarangiye.",
							},
						],
					},
				],
			},
		],
	},
];

type Person = { id: number; centerId: string | null };

function sha256(bytes: Uint8Array): string {
	return createHash("sha256").update(bytes).digest("hex");
}

function courseSlug(title: string): string {
	return title
		.toLowerCase()
		.replaceAll(/[^a-z0-9]+/g, "-")
		.replaceAll(/^-|-$/g, "");
}

async function person(email: string): Promise<Person> {
	const [row] = await db
		.select({ id: users.id, centerId: users.centerId })
		.from(users)
		.where(eq(users.email, email))
		.limit(1);
	if (!row) throw new Error("Demo accounts are missing.");
	return row;
}

async function existingCourse(titleEn: string): Promise<string | null> {
	const [row] = await db
		.select({ id: courseTranslations.courseId })
		.from(courseTranslations)
		.where(
			and(
				eq(courseTranslations.locale, "en"),
				eq(courseTranslations.title, titleEn),
			),
		)
		.limit(1);
	return row?.id ?? null;
}

function expectedTasks(course: CourseSeed): number {
	return course.modules.reduce((sum, module) => sum + module.tasks.length, 0);
}

async function storedTaskCount(courseId: string): Promise<number> {
	const [row] = await db
		.select({ n: sql<number>`count(*)::int` })
		.from(tasks)
		.innerJoin(modules, eq(tasks.moduleId, modules.id))
		.where(eq(modules.courseId, courseId));
	return Number(row?.n ?? 0);
}

/** Drop a half-written seed course. A published course, or one a learner used, stays. */
async function removeUnpublishedSeed(courseId: string): Promise<void> {
	const [course] = await db
		.select({ status: courses.status })
		.from(courses)
		.where(eq(courses.id, courseId))
		.limit(1);
	if (!course || course.status === "published" || course.status === "retired") {
		throw new Error("A seeded course is already published.");
	}
	const [version] = await db
		.select({ id: contentVersions.id })
		.from(contentVersions)
		.where(eq(contentVersions.courseId, courseId))
		.limit(1);
	if (version) throw new Error("A seeded course already has a published pin.");
	const [enrollment] = await db
		.select({ id: enrollments.id })
		.from(enrollments)
		.where(eq(enrollments.courseId, courseId))
		.limit(1);
	if (enrollment) throw new Error("A seeded course already has a learner.");
	await db.transaction(async (tx) => {
		const moduleRows = await tx
			.select({ id: modules.id })
			.from(modules)
			.where(eq(modules.courseId, courseId));
		const moduleIds = moduleRows.map((row) => row.id);
		if (moduleIds.length > 0) {
			const taskRows = await tx
				.select({ id: tasks.id })
				.from(tasks)
				.where(inArray(tasks.moduleId, moduleIds));
			const taskIds = taskRows.map((row) => row.id);
			if (taskIds.length > 0) {
				const [used] = await tx
					.select({ n: sql<number>`count(*)::int` })
					.from(taskSubmissions)
					.where(inArray(taskSubmissions.taskId, taskIds));
				if (Number(used?.n ?? 0) > 0) {
					throw new Error("A seeded course already has learner work.");
				}
				await tx
					.delete(rubricCriteria)
					.where(inArray(rubricCriteria.taskId, taskIds));
				await tx
					.delete(taskTranslations)
					.where(inArray(taskTranslations.taskId, taskIds));
				await tx.delete(tasks).where(inArray(tasks.id, taskIds));
			}
			await tx
				.delete(modulePrerequisites)
				.where(inArray(modulePrerequisites.moduleId, moduleIds));
			await tx
				.delete(modulePrerequisites)
				.where(inArray(modulePrerequisites.requiredModuleId, moduleIds));
			await tx
				.delete(moduleTranslations)
				.where(inArray(moduleTranslations.moduleId, moduleIds));
			await tx.delete(modules).where(inArray(modules.id, moduleIds));
		}
		await tx.delete(badges).where(eq(badges.courseId, courseId));
		await tx
			.delete(courseTranslations)
			.where(eq(courseTranslations.courseId, courseId));
		await tx.delete(courses).where(eq(courses.id, courseId));
	});
}

async function readyCourse(course: CourseSeed): Promise<string | null> {
	const id = await existingCourse(course.titleEn);
	if (!id) return null;
	const [row] = await db
		.select({ status: courses.status })
		.from(courses)
		.where(eq(courses.id, id))
		.limit(1);
	if (!row) return null;
	const complete = (await storedTaskCount(id)) === expectedTasks(course);
	if (course.publish && row.status === "published" && complete) return id;
	if (!course.publish && row.status === "draft" && complete) return id;
	await removeUnpublishedSeed(id);
	return null;
}

async function storeFile(
	ownerUserId: number,
	key: string,
	contentType: string,
	bytes: Uint8Array,
): Promise<void> {
	await getObjectStore().put({ key, contentType, bytes });
	const digest = sha256(bytes);
	await db
		.insert(mediaObjects)
		.values({
			ownerUserId,
			objectKey: key,
			contentType,
			declaredBytes: bytes.byteLength,
			sizeBytes: bytes.byteLength,
			sha256: digest,
			status: "ready",
			finalizedAt: new Date(),
		})
		.onConflictDoNothing({ target: mediaObjects.objectKey });
}

async function buildCourse(
	course: CourseSeed,
	authorId: number,
	reviewerId: number,
): Promise<string> {
	const created = await createCourse(db, {
		actorId: authorId,
		ip: SEED_IP,
		titleEn: course.titleEn,
		titleRw: course.titleRw,
		summaryEn: course.summaryEn,
		summaryRw: course.summaryRw,
		category: course.category,
		economicSector: course.economicSector,
		level: course.level,
	});
	const slug = courseSlug(course.titleEn);
	let fileIndex = 0;
	const moduleIds: string[] = [];
	for (const [moduleIndex, moduleSeed] of course.modules.entries()) {
		const withModule = await createModule(db, {
			actorId: authorId,
			ip: SEED_IP,
			courseId: created.id,
			titleEn: moduleSeed.titleEn,
			titleRw: moduleSeed.titleRw,
			summaryEn: moduleSeed.summaryEn,
			summaryRw: moduleSeed.summaryRw,
		});
		const moduleRow = withModule.modules[withModule.modules.length - 1];
		if (!moduleRow) throw new Error("The module was not stored.");
		moduleIds.push(moduleRow.id);
		const earlier = moduleIds[moduleIndex - 1];
		if (earlier) {
			await updateModule(db, {
				actorId: authorId,
				ip: SEED_IP,
				moduleId: moduleRow.id,
				titleEn: moduleSeed.titleEn,
				titleRw: moduleSeed.titleRw,
				summaryEn: moduleSeed.summaryEn,
				summaryRw: moduleSeed.summaryRw,
				requires: [earlier],
			});
		}
		for (const taskSeed of moduleSeed.tasks) {
			const imageKey = `courses/seed/${slug}-${fileIndex}.png`;
			fileIndex += 1;
			await storeFile(
				authorId,
				imageKey,
				"image/png",
				lessonPicture(taskSeed.scene, fileIndex),
			);
			let jobAidKey: string | undefined;
			if (taskSeed.jobAid) {
				jobAidKey = `courses/seed/${slug}-${fileIndex}.pdf`;
				fileIndex += 1;
				await storeFile(
					authorId,
					jobAidKey,
					"application/pdf",
					lessonPdf(taskSeed.jobAid),
				);
			}
			const withTask = await createTask(db, {
				actorId: authorId,
				ip: SEED_IP,
				moduleId: moduleRow.id,
				titleEn: taskSeed.titleEn,
				titleRw: taskSeed.titleRw,
				instructionsEn: taskSeed.instructionsEn,
				instructionsRw: taskSeed.instructionsRw,
				evidenceType: taskSeed.evidenceType,
				passThreshold: taskSeed.passThreshold,
				required: true,
				imageKey,
				jobAidKey,
				outboundUrl: taskSeed.outboundUrl,
			});
			const storedModule = withTask.modules.find(
				(item) => item.id === moduleRow.id,
			);
			const task = storedModule?.tasks[storedModule.tasks.length - 1];
			if (!task) throw new Error("The task was not stored.");
			for (const criterion of taskSeed.criteria) {
				await createCriterion(db, {
					actorId: authorId,
					ip: SEED_IP,
					taskId: task.id,
					weight: criterion.weight,
					passThreshold: criterion.passThreshold,
					promptEn: criterion.promptEn,
					promptRw: criterion.promptRw,
				});
			}
		}
	}
	if (course.badge) {
		await saveBadge(db, {
			actorId: authorId,
			ip: SEED_IP,
			courseId: created.id,
			titleEn: course.badge.titleEn,
			titleRw: course.badge.titleRw,
			skillEn: course.badge.skillEn,
			skillRw: course.badge.skillRw,
			level: course.badge.level,
			validDays: course.badge.validDays,
			allRequiredTasksApproved: true,
			minimumScore: 70,
			requiresInPerson: false,
		});
	}
	if (!course.publish) return created.id;
	await submitCourseForReview(db, {
		actorId: authorId,
		ip: SEED_IP,
		courseId: created.id,
	});
	await approveCourse(db, {
		actorId: reviewerId,
		ip: SEED_IP,
		courseId: created.id,
	});
	await publishCourse(db, {
		actorId: reviewerId,
		ip: SEED_IP,
		courseId: created.id,
	});
	return created.id;
}

async function enrollLearner(
	learner: Person,
	trainerId: number,
	courseId: string,
): Promise<void> {
	if (!learner.centerId)
		throw new Error("The demo learner has no home center.");
	const [existing] = await db
		.select({ id: enrollments.id })
		.from(enrollments)
		.where(
			and(
				eq(enrollments.userId, learner.id),
				eq(enrollments.courseId, courseId),
			),
		)
		.limit(1);
	if (existing) return;
	await enrollInCourse(db, {
		userId: learner.id,
		courseId,
		centerId: learner.centerId,
		actorId: trainerId,
		ip: SEED_IP,
	});
}

/** Published lessons, one draft, pictures, and job aids. Safe to re-run. */
export async function seedPracticalContent(): Promise<void> {
	if (env.isProduction) return;
	const author = await person("author@demo.ikiraro.test");
	const reviewer = await person("reviewer@demo.ikiraro.test");
	const trainer = await person("trainer@demo.ikiraro.test");
	const learner = await person("learner@demo.ikiraro.test");
	for (const course of COURSES) {
		const already = await readyCourse(course);
		const courseId =
			already ?? (await buildCourse(course, author.id, reviewer.id));
		if (course.publish) await enrollLearner(learner, trainer.id, courseId);
	}
}
