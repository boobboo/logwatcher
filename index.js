var cronJob = require('cron').CronJob,
	exec = require('child_process').exec,
	ejs = require('ejs'),
	hostname = require("os").hostname(),
	nodemailer = require("nodemailer");

require('daemon')();

var jobs = require('./config.json');

var loadTemplate = function(name) {
	var source = require('fs').readFileSync(name, 'utf-8');

	return ejs.compile(source, {});
};

var bodyTemplate = loadTemplate('./mail.ejs');
var subjectTemplate = loadTemplate('./subject.ejs');

var niceExec = function(command, callback) {
	console.info('run', command);
	exec(command, function(err, stdout, stderr) {
		if(err) console.warn("Couldn't execute", command, err);
		else callback(stdout, stderr);
	});
};

var fileNumLines = function(filePath, callback) {
	niceExec('wc -c "' + filePath + '"', function(out, err) {
		callback(1 * out.split(' ')[0]);
	});
};

var transport = nodemailer.createTransport("SMTP", require('./mail.json'));

var from = "InGo Alerter ✔ <alert@letsingo.com>";

var sendEmail = function(options) {
	transport.sendMail(options, function(error, response){
	    if(error) console.error(error);
	    else console.info("Message sent: " + response.message);
	});
};

Object.keys(jobs).forEach(function(jobName) {
	console.log('Starting', jobName);

	var lastLength = 0;
	var jobConfig = jobs[jobName];

	var job = new cronJob({
	  cronTime: '0 * * * * *',
	  onTick: function() {
	    console.log("Running", jobName);
	    
	    fileNumLines(jobConfig.path, function(currentLength) {
	    	var readLength = currentLength - lastLength;

	    	if(readLength > 0) {
	    		niceExec('tail -c +'+(lastLength+1)+' "'+jobConfig.path+'" | head -c '+readLength+' | grep "'+jobConfig.pattern+'"', function(stdout) {
	    			var rows = stdout.split('\n').filter(function(r) { return r !== ''; });
	    			
	    			if(rows.length >= jobConfig.notification.minRows) {
	    				// some rows exists

	    				sendEmail({
	    					from: from,
	    					to: jobConfig.notification.emails.join(', '),
	    					subject: subjectTemplate({
		    					rows: rows,
		    					filePath: jobConfig.path,
		    					host: hostname,
		    					name: jobName
		    				}),
	    					html: bodyTemplate({
		    					rows: rows,
		    					filePath: jobConfig.path,
		    					host: hostname,
		    					name: jobName
		    				})
	    				});
	    			}
	    		});
	    	}

	    	lastLength = currentLength;
	    });
		

	  },
	  start: false,
	  timeZone: process.env.TZ
	});

	job.start();
});

