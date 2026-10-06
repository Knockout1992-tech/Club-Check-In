/* =========================================================
   CONFIG / APPLICATION STATE
   ========================================================= */

const APP_VERSION = "V0.3.0";

const ageGroups = [
    "U6",
    "U7",
    "U8",
    "U9",
    "U10",
    "U11",
    "U12",
    "U13",
    "U14",
    "U15",
    "U16",
    "U17",
    "U18"
];

/* =========================================================
   ACCESS
   ========================================================= */

let coachPIN = "1234";
let seniorPIN = "9999";

/* =========================================================
   SEASON
   ========================================================= */

let currentSeason = "2026/27";

/* =========================================================
   CURRENT SESSION
   ========================================================= */

let currentRole = null;
let currentAgeGroup = null;
let selectedAgeGroups = [];

/* =========================================================
   DAILY REGISTERS
   ========================================================= */

let dailyRegisters = {};

/* =========================================================
   PLAYERS
   ========================================================= */

let players = {

    U6: [
        {
            id: 101,
            name: "Alfie Carter",
            ageGroup: "U6",
            gms: true,
            coachGmsSuggestion: true,
            active: true,
            archived: false,
            lastAttendanceDate: "2026-09-27"
        },
        {
            id: 102,
            name: "Charlie Brooks",
            ageGroup: "U6",
            gms: false,
            coachGmsSuggestion: true,
            active: true,
            archived: false,
            lastAttendanceDate: "2026-09-27"
        },
        {
            id: 103,
            name: "Archie Cooper",
            ageGroup: "U6",
            gms: false,
            coachGmsSuggestion: false,
            active: true,
            archived: false,
            lastAttendanceDate: "2026-06-20"
        },
        {
            id: 104,
            name: "Freddie Baker",
            ageGroup: "U6",
            gms: true,
            coachGmsSuggestion: true,
            active: true,
            archived: false,
            lastAttendanceDate: "2026-09-20"
        }
    ],

    U7: [
        {
            id: 201,
            name: "George Miller",
            ageGroup: "U7",
            gms: true,
            coachGmsSuggestion: true,
            active: true,
            archived: false,
            lastAttendanceDate: "2026-09-22"
        },
        {
            id: 202,
            name: "Harry Wilson",
            ageGroup: "U7",
            gms: false,
            coachGmsSuggestion: false,
            active: true,
            archived: false,
            lastAttendanceDate: "2026-09-22"
        },
        {
            id: 203,
            name: "Oscar Turner",
            ageGroup: "U7",
            gms: true,
            coachGmsSuggestion: true,
            active: true,
            archived: false,
            lastAttendanceDate: "2026-06-15"
        },
        {
            id: 204,
            name: "Theo Green",
            ageGroup: "U7",
            gms: false,
            coachGmsSuggestion: false,
            active: true,
            archived: false,
            lastAttendanceDate: "2026-09-22"
        }
    ],

    U8: [
        {
            id: 1,
            name: "Player One",
            ageGroup: "U8",
            gms: true,
            coachGmsSuggestion: true,
            active: true,
            archived: false,
            lastAttendanceDate: "2026-09-28"
        },
        {
            id: 2,
            name: "Player Two",
            ageGroup: "U8",
            gms: true,
            coachGmsSuggestion: true,
            active: true,
            archived: false,
            lastAttendanceDate: "2026-09-28"
        },
        {
            id: 3,
            name: "Player Three",
            ageGroup: "U8",
            gms: false,
            coachGmsSuggestion: false,
            active: true,
            archived: false,
            lastAttendanceDate: "2026-09-28"
        },
        {
            id: 4,
            name: "Player Four",
            ageGroup: "U8",
            gms: false,
            coachGmsSuggestion: true,
            active: true,
            archived: false,
            lastAttendanceDate: "2026-09-28"
        },
        {
            id: 5,
            name: "Ben Harris",
            ageGroup: "U8",
            gms: true,
            coachGmsSuggestion: true,
            active: true,
            archived: false,
            lastAttendanceDate: "2026-09-28"
        },
        {
            id: 6,
            name: "Ethan Wright",
            ageGroup: "U8",
            gms: false,
            coachGmsSuggestion: false,
            active: true,
            archived: false,
            lastAttendanceDate: "2026-09-28"
        },
        {
            id: 7,
            name: "Liam Foster",
            ageGroup: "U8",
            gms: true,
            coachGmsSuggestion: true,
            active: true,
            archived: false,
            lastAttendanceDate: "2026-09-28"
        },
        {
            id: 8,
            name: "Noah Collins",
            ageGroup: "U8",
            gms: false,
            coachGmsSuggestion: false,
            active: true,
            archived: false,
            lastAttendanceDate: "2026-09-28"
        },

        /* Archived player available for Coach restore testing */
        {
            id: 9,
            name: "Archived U8 Player",
            ageGroup: "U8",
            gms: true,
            coachGmsSuggestion: false,
            active: false,
            archived: true,
            lastAttendanceDate: "2026-05-10"
        }
    ],

    U9: [
        {
            id: 301,
            name: "Jack Taylor",
            ageGroup: "U9",
            gms: true,
            coachGmsSuggestion: true,
            active: true,
            archived: false,
            lastAttendanceDate: "2026-09-27"
        },
        {
            id: 302,
            name: "Leo Martin",
            ageGroup: "U9",
            gms: false,
            coachGmsSuggestion: true,
            active: true,
            archived: false,
            lastAttendanceDate: "2026-09-27"
        },
        {
            id: 303,
            name: "Mason Wood",
            ageGroup: "U9",
            gms: true,
            coachGmsSuggestion: true,
            active: true,
            archived: false,
            lastAttendanceDate: "2026-06-25"
        }
    ],

    U10: [
        {
            id: 401,
            name: "Oliver Smith",
            ageGroup: "U10",
            gms: true,
            coachGmsSuggestion: true,
            active: true,
            archived: false,
            lastAttendanceDate: "2026-09-26"
        },
        {
            id: 402,
            name: "Noah Jones",
            ageGroup: "U10",
            gms: false,
            coachGmsSuggestion: false,
            active: true,
            archived: false,
            lastAttendanceDate: "2026-09-26"
        },
        {
            id: 403,
            name: "Finley Moore",
            ageGroup: "U10",
            gms: false,
            coachGmsSuggestion: false,
            active: true,
            archived: false,
            lastAttendanceDate: "2026-06-10"
        }
    ],

    U11: [
        {
            id: 501,
            name: "Thomas Brown",
            ageGroup: "U11",
            gms: true,
            coachGmsSuggestion: true,
            active: true,
            archived: false,
            lastAttendanceDate: "2026-09-25"
        },
        {
            id: 502,
            name: "Oscar Davies",
            ageGroup: "U11",
            gms: true,
            coachGmsSuggestion: true,
            active: true,
            archived: false,
            lastAttendanceDate: "2026-09-25"
        },
        {
            id: 503,
            name: "Charlie Fox",
            ageGroup: "U11",
            gms: false,
            coachGmsSuggestion: true,
            active: true,
            archived: false,
            lastAttendanceDate: "2026-07-01"
        }
    ],

    U12: [
        {
            id: 601,
            name: "James Evans",
            ageGroup: "U12",
            gms: false,
            coachGmsSuggestion: true,
            active: true,
            archived: false,
            lastAttendanceDate: "2026-09-24"
        },
        {
            id: 602,
            name: "William Thomas",
            ageGroup: "U12",
            gms: false,
            coachGmsSuggestion: false,
            active: true,
            archived: false,
            lastAttendanceDate: "2026-09-24"
        },
        {
            id: 603,
            name: "Henry White",
            ageGroup: "U12",
            gms: true,
            coachGmsSuggestion: true,
            active: true,
            archived: false,
            lastAttendanceDate: "2026-05-30"
        }
    ],

    U13: [
        {
            id: 701,
            name: "Charlie Roberts",
            ageGroup: "U13",
            gms: true,
            coachGmsSuggestion: true,
            active: true,
            archived: false,
            lastAttendanceDate: "2026-09-23"
        },
        {
            id: 702,
            name: "Jacob Walker",
            ageGroup: "U13",
            gms: false,
            coachGmsSuggestion: false,
            active: true,
            archived: false,
            lastAttendanceDate: "2026-09-23"
        },
        {
            id: 703,
            name: "Arthur King",
            ageGroup: "U13",
            gms: false,
            coachGmsSuggestion: false,
            active: true,
            archived: false,
            lastAttendanceDate: "2026-06-01"
        }
    ],

    U14: [
        {
            id: 801,
            name: "Lucas Robinson",
            ageGroup: "U14",
            gms: true,
            coachGmsSuggestion: true,
            active: true,
            archived: false,
            lastAttendanceDate: "2026-09-20"
        },
        {
            id: 802,
            name: "Henry Clark",
            ageGroup: "U14",
            gms: false,
            coachGmsSuggestion: true,
            active: true,
            archived: false,
            lastAttendanceDate: "2026-09-20"
        },
        {
            id: 803,
            name: "Riley James",
            ageGroup: "U14",
            gms: true,
            coachGmsSuggestion: true,
            active: true,
            archived: false,
            lastAttendanceDate: "2026-05-15"
        }
    ],

    U15: [
        {
            id: 901,
            name: "Freddie Lewis",
            ageGroup: "U15",
            gms: true,
            coachGmsSuggestion: true,
            active: true,
            archived: false,
            lastAttendanceDate: "2026-09-19"
        },
        {
            id: 902,
            name: "Archie Lee",
            ageGroup: "U15",
            gms: true,
            coachGmsSuggestion: true,
            active: true,
            archived: false,
            lastAttendanceDate: "2026-09-19"
        },
        {
            id: 903,
            name: "Toby Harris",
            ageGroup: "U15",
            gms: false,
            coachGmsSuggestion: false,
            active: true,
            archived: false,
            lastAttendanceDate: "2026-06-05"
        }
    ],

    U16: [
        {
            id: 1001,
            name: "Finley Walker",
            ageGroup: "U16",
            gms: false,
            coachGmsSuggestion: true,
            active: true,
            archived: false,
            lastAttendanceDate: "2026-09-18"
        },
        {
            id: 1002,
            name: "Theo Hall",
            ageGroup: "U16",
            gms: false,
            coachGmsSuggestion: false,
            active: true,
            archived: false,
            lastAttendanceDate: "2026-09-18"
        },
        {
            id: 1003,
            name: "Reggie Young",
            ageGroup: "U16",
            gms: true,
            coachGmsSuggestion: true,
            active: true,
            archived: false,
            lastAttendanceDate: "2026-05-25"
        }
    ],

    U17: [
        {
            id: 1101,
            name: "Charlie Allen",
            ageGroup: "U17",
            gms: true,
            coachGmsSuggestion: true,
            active: true,
            archived: false,
            lastAttendanceDate: "2026-09-17"
        },
        {
            id: 1102,
            name: "Alfie Young",
            ageGroup: "U17",
            gms: false,
            coachGmsSuggestion: false,
            active: true,
            archived: false,
            lastAttendanceDate: "2026-09-17"
        },
        {
            id: 1103,
            name: "Louie Scott",
            ageGroup: "U17",
            gms: true,
            coachGmsSuggestion: true,
            active: true,
            archived: false,
            lastAttendanceDate: "2026-06-12"
        }
    ],

    U18: [
        {
            id: 1201,
            name: "Sam King",
            ageGroup: "U18",
            gms: true,
            coachGmsSuggestion: true,
            active: true,
            archived: false,
            lastAttendanceDate: "2026-09-16"
        },
        {
            id: 1202,
            name: "Max Wright",
            ageGroup: "U18",
            gms: false,
            coachGmsSuggestion: true,
            active: true,
            archived: false,
            lastAttendanceDate: "2026-09-16"
        }
    ]

};

/* =========================================================
   SESSIONS
   ========================================================= */

let sessions = {

    U6: [
        {
            date: "21/09/2026",
            dateKey: "2026-09-21",
            present: 2,
            total: 4
        }
    ],

    U7: [
        {
            date: "22/09/2026",
            dateKey: "2026-09-22",
            present: 2,
            total: 4
        }
    ],

    U8: [
        {
            date: "28/09/2026",
            dateKey: "2026-09-28",
            present: 5,
            total: 8
        }
    ],

    U9: [
        {
            date: "27/09/2026",
            dateKey: "2026-09-27",
            present: 2,
            total: 3
        }
    ],

    U10: [
        {
            date: "26/09/2026",
            dateKey: "2026-09-26",
            present: 1,
            total: 3
        }
    ],

    U11: [
        {
            date: "25/09/2026",
            dateKey: "2026-09-25",
            present: 2,
            total: 3
        }
    ],

    U12: [
        {
            date: "24/09/2026",
            dateKey: "2026-09-24",
            present: 2,
            total: 3
        }
    ],

    U13: [
        {
            date: "23/09/2026",
            dateKey: "2026-09-23",
            present: 2,
            total: 3
        }
    ],

    U14: [
        {
            date: "20/09/2026",
            dateKey: "2026-09-20",
            present: 2,
            total: 3
        }
    ],

    U15: [
        {
            date: "19/09/2026",
            dateKey: "2026-09-19",
            present: 2,
            total: 3
        }
    ],

    U16: [
        {
            date: "18/09/2026",
            dateKey: "2026-09-18",
            present: 2,
            total: 3
        }
    ],

    U17: [
        {
            date: "17/09/2026",
            dateKey: "2026-09-17",
            present: 2,
            total: 3
        }
    ],

    U18: [
        {
            date: "16/09/2026",
            dateKey: "2026-09-16",
            present: 1,
            total: 2
        }
    ]

};
