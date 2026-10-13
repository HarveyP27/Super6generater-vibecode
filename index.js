const homeTeamText = [];
const awayTeamText = [];
const homeTeamxG = [];
const awayTeamxG = [];
let match1Locked = false;
let match2Locked = false;
let match3Locked = false;
let match4Locked = false;
let match5Locked = false;
let match6Locked = false;
loadTeams();

async function loadTeams(){

    try{
                
        

        const response = await fetch("https://api.s6.sbgservices.com/v2/round/active")
        
        if(!response.ok){
            throw new Error("Could not fetch data")
        }

        const data = await response.json();

        for (let i = 0; i < 6; i++){
            const n = i + 1; 
            homeTeamText[i] = data.scoreChallenges.at(i).match.homeTeam.name;
            const homeTeamImg = data.scoreChallenges.at(i).match.homeTeam.badgeUri;
            const homeTeamTextElement = document.querySelector(`#homeTeam${n} p`);
            const homeTeamImgElement = document.querySelector(`#homeTeam${n} img`);
            awayTeamText[i] = data.scoreChallenges.at(i).match.awayTeam.name;
            const awayTeamImg = data.scoreChallenges.at(i).match.awayTeam.badgeUri;
            const awayTeamTextElement = document.querySelector(`#awayTeam${n} p`);
            const awayTeamImgElement = document.querySelector(`#awayTeam${n} img`);
            homeTeamTextElement.textContent = homeTeamText[i];
            homeTeamImgElement.src = homeTeamImg;
            awayTeamTextElement.textContent = awayTeamText[i];
            awayTeamImgElement.src = awayTeamImg;
        }
        

    }
    catch(error){
        console.error(error);
    }
    
    await getxG();
}

// Names differ between Super 6 and xG Stat (e.g. "Spurs" vs "Tottenham Hotspur"),
// so both are reduced to one short key before comparing.
const TEAM_ALIASES = {
    "arsenal": "arsenal",
    "aston villa": "villa", "villa": "villa",
    "bournemouth": "bournemouth",
    "brentford": "brentford",
    "brighton": "brighton", "brighton hove": "brighton", "brighton and hove albion": "brighton",
    "burnley": "burnley",
    "chelsea": "chelsea",
    "coventry": "coventry", "coventry city": "coventry",
    "crystal palace": "palace", "palace": "palace",
    "everton": "everton",
    "fulham": "fulham",
    "hull": "hull", "hull city": "hull",
    "ipswich": "ipswich", "ipswich town": "ipswich",
    "leeds": "leeds", "leeds united": "leeds",
    "liverpool": "liverpool",
    "man city": "mancity", "manchester city": "mancity",
    "man utd": "manutd", "man united": "manutd", "manchester united": "manutd",
    "newcastle": "newcastle", "newcastle united": "newcastle",
    "nottm forest": "forest", "nottingham": "forest", "nottingham forest": "forest", "forest": "forest",
    "sunderland": "sunderland",
    "spurs": "spurs", "tottenham": "spurs", "tottenham hotspur": "spurs",
    "west ham": "westham", "west ham united": "westham",
    "wolves": "wolves", "wolverhampton wanderers": "wolves",
    "leicester": "leicester", "leicester city": "leicester",
    "southampton": "southampton"
};
const DEFAULT_XG = 1.3; // used only if a fixture can't be matched, so Generate still works

function teamKey(name){
    const cleaned = String(name)
        .toLowerCase()
        .replace(/&/g, " and ")
        .replace(/[^a-z ]/g, " ")
        .replace(/^afc /, "")
        .replace(/ fc$/, "")
        .replace(/\s+/g, " ")
        .trim();
    return TEAM_ALIASES[cleaned] ?? cleaned;
}

async function getxG(){

    try{

        // xg.json is refreshed on a schedule by xgstat_xg_scraper.py (GitHub Action)
        const response = await fetch("./xg.json", { cache: "no-store" });

        if(!response.ok){
            throw new Error("Could not fetch data")
        }

        const data = await response.json();
        for (let i = 0; i < 6; i++){
            const x = i + 1;
            const homeKey = teamKey(homeTeamText[i]);
            const awayKey = teamKey(awayTeamText[i]);
            const match = data.fixtures.find(fixture =>
                    teamKey(fixture.home) === homeKey
                    &&
                    teamKey(fixture.away) === awayKey
                );
            const homexgElement = document.getElementById(`homexg${x}`);
            const awayxgElement = document.getElementById(`awayxg${x}`);

            if(!match){
                console.warn(`No xG found for ${homeTeamText[i]} v ${awayTeamText[i]}`);
                homeTeamxG[i] = DEFAULT_XG;
                awayTeamxG[i] = DEFAULT_XG;
                homexgElement.textContent = "xG: n/a";
                awayxgElement.textContent = "xG: n/a";
                continue;
            }

            homeTeamxG[i] = match.expectedGoals.home;
            awayTeamxG[i] = match.expectedGoals.away;
            homexgElement.textContent = "xG: " + homeTeamxG[i].toFixed(2);
            awayxgElement.textContent = "xG: " + awayTeamxG[i].toFixed(2);
        }

        console.log(homeTeamxG);
        console.log(awayTeamxG);
    }catch(error){
        console.error(error);
    }

}

const generateButton = document.querySelector("#generate");
generateButton.addEventListener("click", generate);

function generate(){
        

    for (let i = 0; i < 6; i++){
            
        const n = i + 1;
        if((n === 1 && !match1Locked) ||
            (n === 2 && !match2Locked) ||
            (n === 3 && !match3Locked) ||
            (n === 4 && !match4Locked) ||
            (n === 5 && !match5Locked) ||
            (n === 6 && !match6Locked)){
                
                const matchRandomnessElement = document.getElementById(`randomness${n}`).value;
                let homeTeamGoals = 0;
                let awayTeamGoals = 0;
                if(matchRandomnessElement === "very-conservative"){
                    const homeLambda = 29.775 * Math.pow(homeTeamxG[i], 5.607);
                    const awayLambda = 29.775 * Math.pow(awayTeamxG[i], 5.607);
                    homeTeamGoals = generateGoalsConservative(homeLambda, 8);
                    awayTeamGoals = generateGoalsConservative(awayLambda, 8);
                }else if(matchRandomnessElement === "conservative"){
                    const homeLambda = 2.35 * Math.pow(homeTeamxG[i], 1.855);
                    const awayLambda = 2.35 * Math.pow(awayTeamxG[i], 1.855);
                    homeTeamGoals = generateGoalsConservative(homeLambda, 2.5);
                    awayTeamGoals = generateGoalsConservative(awayLambda, 2.5);
                }else if(matchRandomnessElement === "poisson"){
                    homeTeamGoals = generateGoalsPoisson(homeTeamxG[i]);
                    awayTeamGoals = generateGoalsPoisson(awayTeamxG[i]);
                }else if(matchRandomnessElement === "match-xg"){
                    homeTeamGoals = Math.round(homeTeamxG[i]);
                    awayTeamGoals = Math.round(awayTeamxG[i]);
                }else{
                    homeTeamGoals = Math.floor(Math.random() * 7);
                    awayTeamGoals = Math.floor(Math.random() * 7);
                }
            
                const homeTeamGoalsElement = document.getElementById(`homeScore${n}`);
                const awayTeamGoalsElement = document.getElementById(`awayScore${n}`);
                homeTeamGoalsElement.textContent = homeTeamGoals;
                awayTeamGoalsElement.textContent = awayTeamGoals;
        }
            
    }

}


function generateGoalsConservative(lambda, concentration) {
    const weights = [];
    for (let goals = 0; goals <= 8; goals++) {
        weights[goals] = Math.pow(lambda, goals) / Math.pow(factorial(goals), concentration);
        
    }
    const normalisedWeights = normalise(weights);
    const randomNumber = Math.random();
    
    let probXGoals = 0;
    let goalsFound = false;
    let goals =-1;
    do {
        goals += 1;
        probXGoals = probXGoals + normalisedWeights[goals];
        if(probXGoals > randomNumber){
            goalsFound = true;
        }
    } while(!goalsFound)
    
    return goals;
}

function generateGoalsPoisson(xG) {
    const randomNumber = Math.random();
    const lambda = xG;

    let probXGoals = 0;
    let goalsFound = false;
    let goals = -1;

    do {
        goals += 1;
        probXGoals = probXGoals + ((Math.pow(lambda, goals) * Math.exp(-lambda)) / factorial(goals));

        if (probXGoals > randomNumber) {
            goalsFound = true;
        }
    } while (!goalsFound)

    return goals;
    
}

function factorial(n) {
    let result = 1;

    for (let i = 2; i <= n; i++) {
        result *= i;
    }

    return result;
}

function normalise(weights){
    const normalisedWeights = [];
    const total = weights.reduce((accumulator, current) => accumulator + current, 0);
    for(let goals = 0; goals <= 8; goals++)
        normalisedWeights[goals] = (weights[goals])/(total)
    return normalisedWeights;
}

const lockButtons = document.querySelectorAll(".lock");
lockButtons.forEach(button => {
    button.addEventListener("click", function() {
        const lockImage1 = document.querySelector("#lockImage1");
        const lockImage2 = document.querySelector("#lockImage2");
        const lockImage3 = document.querySelector("#lockImage3");
        const lockImage4 = document.querySelector("#lockImage4");
        const lockImage5 = document.querySelector("#lockImage5");
        const lockImage6 = document.querySelector("#lockImage6");
        if(this.id === "lock1" && match1Locked === false){
            match1Locked = true;
            lockImage1.src = "./images/locked.png";
        }else if(this.id === "lock1" && match1Locked === true){
            match1Locked = false;
            lockImage1.src = "./images/unlocked.png";
        }else if(this.id === "lock2" && match2Locked === false){
            match2Locked = true;
            lockImage2.src = "./images/locked.png";
        }else if(this.id === "lock2" && match2Locked === true){
            match2Locked = false;
            lockImage2.src = "./images/unlocked.png";
        }else if(this.id === "lock3" && match3Locked === false){
            match3Locked = true;
            lockImage3.src = "./images/locked.png";
        }else if(this.id === "lock3" && match3Locked === true){
            match3Locked = false;
            lockImage3.src = "./images/unlocked.png";
        }else if(this.id === "lock4" && match4Locked === false){
            match4Locked = true;
            lockImage4.src = "./images/locked.png";
        }else if(this.id === "lock4" && match4Locked === true){
            match4Locked = false;
            lockImage4.src = "./images/unlocked.png";
        }else if(this.id === "lock5" && match5Locked === false){
            match5Locked = true;
            lockImage5.src = "./images/locked.png";
        }else if(this.id === "lock5" && match5Locked === true){
            match5Locked = false;
            lockImage5.src = "./images/unlocked.png";
        }else if(this.id === "lock6" && match6Locked === false){
            match6Locked = true;
            lockImage6.src = "./images/locked.png";
        }else if(this.id === "lock6" && match6Locked === true){
            match6Locked = false;
            lockImage6.src = "./images/unlocked.png";
        }
    });
});

const xgSwitch = document.querySelector("#xgSwitch");

const xgElementsRight = document.querySelectorAll(".xGshownRight");
const xgElementsLeft = document.querySelectorAll(".xGshownLeft");

xgSwitch.addEventListener("change", function() {

    if (this.checked) {

        xgElementsRight.forEach(element => {
            element.style.visibility = "visible";
        });

        xgElementsLeft.forEach(element => {
            element.style.visibility = "visible";
        });

    } else {

        xgElementsRight.forEach(element => {
            element.style.visibility = "hidden";
        });

        xgElementsLeft.forEach(element => {
            element.style.visibility = "hidden";
        });

    }

});