const fs = require('fs');
const Discord = require('discord.js');
const fetch = require('node-fetch');
const path = require('path');
const querystring = require('querystring');
require('dotenv').config();

const client = new Discord.Client();
client.login("");

// List of Game Boy and Super Game Boy 2 games
// Filled in future functions
var games = [];

// Verify time of last run checked
var checkTime;

// Most recent runs
let mostRecent = [];

// List of games to exclude
const excludedGames = ['j1neney1'];

// Convert times to a readable format
const convert = time => {
  let hr, min, sec, ms;
  let parts = time.toString().split('.');
  ms = parts.length > 1 ? parseInt((parts[1] + '00').substr(0,3)) : undefined;
  sec = parseInt(parts[0]);
  if (sec >= 60) {min = Math.floor(sec / 60); sec = sec < 10 ? '0' + (sec % 60) : sec % 60}
  if (min >= 60) {hr = Math.floor(min / 60); min = min < 10 ? '0' + (min % 60) : min % 60}
  ms = ms < 10 ? '00' + ms : ms < 100 ? '0' + ms : ms;
  if (min === undefined) return ms === undefined ? sec.toString() + 's' : sec.toString() + 's ' + ms.toString() + 'ms';
  else if (hr === undefined) return ms === undefined ? min.toString() + 'm ' + sec.toString() + 's' : min.toString() + 'm ' + sec.toString() + 's ' + ms.toString() + 'ms';
  else return ms === undefined ? hr.toString() + 'h ' + min.toString() + 'm ' + sec.toString() + 's' : hr.toString() + 'h ' + min.toString() + 'm ' + sec.toString() + 's ' + ms.toString() + 'ms';
}

client.once('ready', async () => {
  console.log('ready');
  // Discord status
  client.user.setActivity("PORTABLE POWER!");
  // Get all games with Game Boy platform
  const response = await fetch(`https://www.speedrun.com/api/v1/games?platform=n5683oev&_bulk=1&max=1000`);
  const gbQuery = await response.json();
  // Add all game IDs to GB games array
  let gbGames = [];
  gbQuery.data.forEach(g => gbGames.push(g.id));
  // Get all games with Super Game Boy 2 platform
  const response2 = await fetch(`https://www.speedrun.com/api/v1/games?platform=n5e147e2&_bulk=1&max=1000`);
  const sgbQuery = await response2.json();
  // Find all games that are SGB2 but not GB
  const sgbArray = sgbQuery.data.map(g => g.id);
  let sgbGames = sgbArray.filter(g => gbGames.indexOf(g) < 0);
  // Combine all unique games
  games = gbGames.concat(sgbGames);
  excludedGames.forEach(e => games.splice(games.indexOf(e), 1));
});

// Periodically update games array, in case new games are added
client.setInterval( async() => {
  const response = await fetch(`https://www.speedrun.com/api/v1/games?platform=n5683oev&_bulk=1&max=1000`);
  const gbQuery = await response.json();
  let gbGames = [];
  gbQuery.data.forEach(g => gbGames.push(g.id));
  const response2 = await fetch(`https://www.speedrun.com/api/v1/games?platform=n5e147e2&_bulk=1&max=1000`);
  const sgbQuery = await response2.json();
  const sgbArray = sgbQuery.data.map(g => g.id);
  let sgbGames = sgbArray.filter(g => gbGames.indexOf(g) < 0);
  games = gbGames.concat(sgbGames);
  excludedGames.forEach(e => games.splice(games.indexOf(e), 1));
}, 216e5); // 6 hours

client.setInterval( async () => {
  // Get 20 most recent verified runs
  let p = 0;
  let newCheckTime;
  do {
    const offset = p === 0 ? '' : '&offset=' + (20 * p).toString();
    const recentRunsResponse = await fetch(`https://www.speedrun.com/api/v1/runs?status=verified&orderby=verify-date&direction=desc&embed=game,category.variables,platform,players${offset}`);
    const recentRunsObject = await recentRunsResponse.json();
    const recentRuns = recentRunsObject.data;
    for (let i = 0; i < recentRuns.length; i++) {
      const thisRun = recentRuns[i];
      // When run was verified
      const verifyTime = await new Date(thisRun.status['verify-date']);
      // Update time to check if it's the first run
      if (i === 0) {
        if (checkTime === undefined) checkTime = verifyTime;
        newCheckTime = verifyTime;
      }
      // If the run was before last first checked run, quit (but update time!)
      if (verifyTime - checkTime <= 0) {
        checkTime = newCheckTime;
        continue;
      }
      // Platforms: SGB, SGB2, GB, GBP, 3DSVC, GBI, GBA, GBC
      const allowedPlatforms = ['n5683oev', 'n5e147e2', '7g6mx89r', '3167jd6q', '7m6yvw6p', 'vm9v3ne3', '3167d6q2', 'gde3g9k1'];
      // Skip if the game is not in the games array or is a per-level category or is not a platform listed above
      if (!games.includes(thisRun.game.data.id) || thisRun.category.data.type === "per-level" || !allowedPlatforms.includes(thisRun.system.platform)) continue;
      // Skip if recently done (API bug)
      if (mostRecent.includes(thisRun.id)) continue;
      // Get subcategory information
      const subCategoryObject = thisRun.category.data.variables.data.find(v => v['is-subcategory']);
      let subCatQuery = '';
      // Add subcategory to leaderboard query
      if (subCategoryObject !== undefined) {
        const varKey = '&var-' + subCategoryObject.id;
        subCatQuery = querystring.stringify({ [varKey]: thisRun.values[subCategoryObject.id] });
      }
      // Get leaderboard of current run's game and category
      const leaderboardResponse = await fetch(`https://www.speedrun.com/api/v1/leaderboards/${thisRun.game.data.id}/category/${thisRun.category.data.id}?top=1${subCatQuery}`);
      const leaderboardObject = await leaderboardResponse.json();
      const leaderboard = leaderboardObject.data;
      // If the run isn't 1st place, skip it
      if (thisRun.id !== leaderboard.runs[0].run.id) continue;
      // Get run information
      // Get runner name
      const runnerName = thisRun.players.data[0].rel === 'user' ? thisRun.players.data[0].names.international : thisRun.players.data[0].name;
      // Get subcategory name
      let subCategory = '';
      if (subCategoryObject !== undefined) {
        const subCatValue = thisRun.values[subCategoryObject.id];
        subCategory = ' (' + subCategoryObject.values.values[subCatValue].label + ')';
      }
      // Create Discord embed
      const embed = new Discord.MessageEmbed()
        .setColor('#80C86F')
        .setTitle(convert(thisRun.times.primary_t) + ' by ' + runnerName)
        .setThumbnail(thisRun.game.data.assets['cover-medium'].uri)
        .setURL(thisRun.weblink)
        .setAuthor(thisRun.game.data.names.international + ' - ' + thisRun.category.data.name + subCategory)
        .addField('Date Played:', thisRun.date)
        .setTimestamp();
      if (mostRecent.length === 400) mostRecent.shift();
      mostRecent.push(thisRun.id);
      // Create array of channels
      const serverFile = fs.readFileSync(path.join(__dirname, 'servers.json'));
      let servers = JSON.parse(serverFile).servers;
      let channels = servers.map(s => s.channel);
      // Message each of the channels
      for (let j = 0; j < channels.length; j++) {
        const thisChannel = await client.channels.fetch(channels[j]);
        await thisChannel.send(embed).then(msg => checkTime = newCheckTime);
      }
    }
  } while (p < 10);
  // Update time to check
  checkTime = newCheckTime;
}, 3e5); // 5 minutes

client.on('message', async message => {
  // Require message to be from server owner (or god) and mention the bot and only mention one channel
  if ((message.member.id === message.guild.ownerID || message.member.id === "110786779191222272") && message.mentions.users.has(client.user.id) && message.mentions.channels.size === 1) {
    // Get the channel ID of channel mentioned
    const channelId = message.mentions.channels.first().id;
    // Path of server/channel information
    const p = path.join(__dirname, 'servers.json');
    // If the files doesn't exist, create it
    if (!fs.existsSync(p)) {
      const newObject = {"servers": []};
      fs.writeFileSync(p, JSON.stringify(newObject));
    }
    // Read the file and parse it
    const contents = fs.readFileSync(p);
    let obj = JSON.parse(contents).servers;
    // Check if server exists in file
    const existingServer = obj.find(e => e.server === message.guild.id);
    // If it exists, update the channel
    if (existingServer !== undefined) {
      existingServer.channel = channelId;
      existingServer.channelName = message.mentions.channels.first().name;
    }
    // If not, add the server and channel
    else {
      const newServer = {"server": message.guild.id, "serverName": message.guild.name, "channel": channelId, "channelName": message.mentions.channels.first().name};
      obj.push(newServer);
    }
    // Let owner know it worked
    message.reply('Now sending in ' + message.mentions.channels.first().name);
    // Write the file
    fs.writeFileSync(p, JSON.stringify({"servers": obj}));
  }
});

client.on('guildDelete', guild => {
  // Read the servers file and parse it
  const contents = fs.readFileSync(path.join(__dirname, 'servers.json'));
  let obj = JSON.parse(contents).servers;
  // Find the server being left
  obj.splice(obj.findIndex(e => e.server === guild.id), 1);
  // Write the file
  fs.writeFileSync(path.join(__dirname, 'servers.json'), JSON.stringify({"servers": obj}));
});
