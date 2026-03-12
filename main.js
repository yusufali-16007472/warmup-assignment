const fs = require("fs");

// Delivery Driver Shift Tracker - manages shift logs, quotas, and pay calculations

// Helper: convert "hh:mm:ss am/pm" to total seconds
function timeToSeconds(timeStr) {
    timeStr = timeStr.trim();
    const parts = timeStr.split(' ');
    const period = parts[1].toLowerCase();
    const timeParts = parts[0].split(':');
    let hours = parseInt(timeParts[0]);
    const minutes = parseInt(timeParts[1]);
    const seconds = parseInt(timeParts[2]);

    if (period === 'am') {
        if (hours === 12) hours = 0;
    } else {
        if (hours !== 12) hours += 12;
    }

    return hours * 3600 + minutes * 60 + seconds;
}

// Helper: convert "h:mm:ss" or "hhh:mm:ss" duration string to total seconds
function durationToSeconds(durationStr) {
    durationStr = durationStr.trim();
    const parts = durationStr.split(':');
    return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2]);
}

// Helper: convert total seconds to "h:mm:ss"
function secondsToDuration(totalSeconds) {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ============================================================
// Function 1: getShiftDuration(startTime, endTime)
// startTime: (typeof string) formatted as hh:mm:ss am or hh:mm:ss pm
// endTime: (typeof string) formatted as hh:mm:ss am or hh:mm:ss pm
// Returns: string formatted as h:mm:ss
// ============================================================
function getShiftDuration(startTime, endTime) {
    const startSec = timeToSeconds(startTime);
    const endSec = timeToSeconds(endTime);
    const diff = endSec - startSec;
    return secondsToDuration(diff);
}

// ============================================================
// Function 2: getIdleTime(startTime, endTime)
// startTime: (typeof string) formatted as hh:mm:ss am or hh:mm:ss pm
// endTime: (typeof string) formatted as hh:mm:ss am or hh:mm:ss pm
// Returns: string formatted as h:mm:ss
// Delivery hours: 8:00 AM - 10:00 PM (8 to 22)
// ============================================================
function getIdleTime(startTime, endTime) {
    const startSec = timeToSeconds(startTime);
    const endSec = timeToSeconds(endTime);

    const deliveryStart = 8 * 3600; // 8:00:00 AM
    const deliveryEnd = 22 * 3600;  // 10:00:00 PM

    let idleSec = 0;

    if (startSec < deliveryStart) {
        idleSec += Math.min(deliveryStart, endSec) - startSec;
    }
    if (endSec > deliveryEnd) {
        idleSec += endSec - Math.max(deliveryEnd, startSec);
    }
    if (idleSec < 0) idleSec = 0;

    return secondsToDuration(idleSec);
}

// ============================================================
// Function 3: getActiveTime(shiftDuration, idleTime)
// shiftDuration: (typeof string) formatted as h:mm:ss
// idleTime: (typeof string) formatted as h:mm:ss
// Returns: string formatted as h:mm:ss
// ============================================================
function getActiveTime(shiftDuration, idleTime) {
    const shiftSec = durationToSeconds(shiftDuration);
    const idleSec = durationToSeconds(idleTime);
    return secondsToDuration(shiftSec - idleSec);
}

// ============================================================
// Function 4: metQuota(date, activeTime)
// date: (typeof string) formatted as yyyy-mm-dd
// activeTime: (typeof string) formatted as h:mm:ss
// Returns: boolean
// Eid period Apr 10-30, 2025: 6 hours. Normal: 8h 24m
// ============================================================
function metQuota(date, activeTime) {
    const activeSec = durationToSeconds(activeTime);
    const dateParts = date.split('-');
    const year = parseInt(dateParts[0]);
    const month = parseInt(dateParts[1]);
    const day = parseInt(dateParts[2]);

    let quotaSec;
    if (year === 2025 && month === 4 && day >= 10 && day <= 30) {
        quotaSec = 6 * 3600;
    } else {
        quotaSec = 8 * 3600 + 24 * 60;
    }
    return activeSec >= quotaSec;
}

// ============================================================
// Function 5: addShiftRecord(textFile, shiftObj)
// ============================================================
function addShiftRecord(textFile, shiftObj) {
    const { driverID, driverName, date, startTime, endTime } = shiftObj;

    let lines = [];
    try {
        const content = fs.readFileSync(textFile, 'utf8');
        lines = content.split('\n').filter(line => line.trim() !== '');
    } catch (e) {
        lines = [];
    }

    // Skip header line when checking
    const dataLines = lines[0] && lines[0].includes('DriverID') ? lines.slice(1) : lines;

    for (const line of dataLines) {
        const cols = line.split(',');
        if (cols[0].trim() === driverID && cols[2].trim() === date) {
            return {};
        }
    }

    const shiftDuration = getShiftDuration(startTime, endTime);
    const idleTime = getIdleTime(startTime, endTime);
    const activeTime = getActiveTime(shiftDuration, idleTime);
    const quota = metQuota(date, activeTime);
    const hasBonus = false;

    const newRecord = {
        driverID,
        driverName,
        date,
        startTime: startTime.trim(),
        endTime: endTime.trim(),
        shiftDuration,
        idleTime,
        activeTime,
        metQuota: quota,
        hasBonus
    };

    const newLine = `${driverID},${driverName},${date},${startTime.trim()},${endTime.trim()},${shiftDuration},${idleTime},${activeTime},${quota},${hasBonus}`;

    // Insert after last record of this driverID
    const hasHeader = lines[0] && lines[0].includes('DriverID');
    const header = hasHeader ? [lines[0]] : [];
    const data = hasHeader ? lines.slice(1) : lines;

    let lastIndex = -1;
    for (let i = 0; i < data.length; i++) {
        const cols = data[i].split(',');
        if (cols[0].trim() === driverID) {
            lastIndex = i;
        }
    }

    if (lastIndex === -1) {
        data.push(newLine);
    } else {
        data.splice(lastIndex + 1, 0, newLine);
    }

    const output = hasHeader ? header.concat(data).join('\n') + '\n' : data.join('\n') + '\n';
    fs.writeFileSync(textFile, output, 'utf8');

    return newRecord;
}

// ============================================================
// Function 6: setBonus(textFile, driverID, date, newValue)
// ============================================================
function setBonus(textFile, driverID, date, newValue) {
    const content = fs.readFileSync(textFile, 'utf8');
    const lines = content.split('\n');

    const updatedLines = lines.map(line => {
        if (line.trim() === '') return line;
        const cols = line.split(',');
        if (cols.length >= 10 && cols[0].trim() === driverID && cols[2].trim() === date) {
            cols[9] = newValue.toString();
            return cols.join(',');
        }
        return line;
    });

    fs.writeFileSync(textFile, updatedLines.join('\n'), 'utf8');
}

// ============================================================
// Function 7: countBonusPerMonth(textFile, driverID, month)
// ============================================================
function countBonusPerMonth(textFile, driverID, month) {
    const content = fs.readFileSync(textFile, 'utf8');
    const lines = content.split('\n').filter(line => line.trim() !== '');

    const dataLines = lines[0] && lines[0].includes('DriverID') ? lines.slice(1) : lines;
    const targetMonth = parseInt(month);
    let driverExists = false;
    let count = 0;

    for (const line of dataLines) {
        const cols = line.split(',');
        if (cols[0].trim() === driverID) {
            driverExists = true;
            const dateParts = cols[2].trim().split('-');
            const recordMonth = parseInt(dateParts[1]);
            if (recordMonth === targetMonth && cols[9].trim() === 'true') {
                count++;
            }
        }
    }

    return driverExists ? count : -1;
}

// ============================================================
// Function 8: getTotalActiveHoursPerMonth(textFile, driverID, month)
// ============================================================
function getTotalActiveHoursPerMonth(textFile, driverID, month) {
    const content = fs.readFileSync(textFile, 'utf8');
    const lines = content.split('\n').filter(line => line.trim() !== '');

    const dataLines = lines[0] && lines[0].includes('DriverID') ? lines.slice(1) : lines;
    let totalSec = 0;

    for (const line of dataLines) {
        const cols = line.split(',');
        if (cols[0].trim() === driverID) {
            const dateParts = cols[2].trim().split('-');
            const recordMonth = parseInt(dateParts[1]);
            if (recordMonth === month) {
                totalSec += durationToSeconds(cols[7].trim());
            }
        }
    }

    return secondsToDuration(totalSec);
}

// ============================================================
// Function 9: getRequiredHoursPerMonth(...)
// Required = sum of daily quotas for working days (excluding day off) - 2h per bonus
// ============================================================
function getRequiredHoursPerMonth(textFile, rateFile, bonusCount, driverID, month) {
    const shiftContent = fs.readFileSync(textFile, 'utf8');
    const shiftLines = shiftContent.split('\n').filter(line => line.trim() !== '');
    const shiftData = shiftLines[0] && shiftLines[0].includes('DriverID') ? shiftLines.slice(1) : shiftLines;

    const rateContent = fs.readFileSync(rateFile, 'utf8');
    const rateLines = rateContent.split('\n').filter(line => line.trim() !== '');
    const rateData = rateLines[0] && rateLines[0].includes('DriverID') ? rateLines.slice(1) : rateLines;

    let dayOff = null;
    for (const line of rateData) {
        const cols = line.split(',');
        if (cols[0].trim() === driverID) {
            dayOff = cols[1].trim().toLowerCase();
            break;
        }
    }

    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    let totalSec = 0;

    for (const line of shiftData) {
        const cols = line.split(',');
        if (cols[0].trim() !== driverID) continue;

        const dateStr = cols[2].trim();
        const dateParts = dateStr.split('-');
        const recordMonth = parseInt(dateParts[1]);
        if (recordMonth !== month) continue;

        const d = new Date(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2]));
        const dayName = dayNames[d.getDay()];
        if (dayOff && dayName === dayOff) continue;

        const year = parseInt(dateParts[0]);
        const day = parseInt(dateParts[2]);
        let dailyQuotaSec;
        if (year === 2025 && recordMonth === 4 && day >= 10 && day <= 30) {
            dailyQuotaSec = 6 * 3600;
        } else {
            dailyQuotaSec = 8 * 3600 + 24 * 60;
        }
        totalSec += dailyQuotaSec;
    }

    totalSec -= bonusCount * 2 * 3600;
    if (totalSec < 0) totalSec = 0;

    return secondsToDuration(totalSec);
}

// ============================================================
// Function 10: getNetPay(driverID, actualHours, requiredHours, rateFile)
// Tier allowances: 1=50h, 2=20h, 3=10h, 4=3h
// Deduction: floor(basePay/185) per full missing hour beyond allowance
// ============================================================
function getNetPay(driverID, actualHours, requiredHours, rateFile) {
    const content = fs.readFileSync(rateFile, 'utf8');
    const lines = content.split('\n').filter(line => line.trim() !== '');
    const dataLines = lines[0] && lines[0].includes('DriverID') ? lines.slice(1) : lines;

    let basePay = 0;
    let tier = 0;
    for (const line of dataLines) {
        const cols = line.split(',');
        if (cols[0].trim() === driverID) {
            basePay = parseInt(cols[2].trim());
            tier = parseInt(cols[3].trim());
            break;
        }
    }

    const actualSec = durationToSeconds(actualHours);
    const requiredSec = durationToSeconds(requiredHours);

    if (actualSec >= requiredSec) return basePay;

    const missingSec = requiredSec - actualSec;
    const missingHours = missingSec / 3600;

    const allowedMissing = { 1: 50, 2: 20, 3: 10, 4: 3 };
    const allowed = allowedMissing[tier] || 0;
    const billableMissingHours = missingHours - allowed;

    if (billableMissingHours <= 0) return basePay;

    const fullBillableHours = Math.floor(billableMissingHours);
    const deductionRatePerHour = Math.floor(basePay / 185);
    const salaryDeduction = fullBillableHours * deductionRatePerHour;

    return basePay - salaryDeduction;
}

module.exports = {
    getShiftDuration,
    getIdleTime,
    getActiveTime,
    metQuota,
    addShiftRecord,
    setBonus,
    countBonusPerMonth,
    getTotalActiveHoursPerMonth,
    getRequiredHoursPerMonth,
    getNetPay
};
