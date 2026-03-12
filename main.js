const fs = require("fs");

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
// ============================================================
function getIdleTime(startTime, endTime) {
    const startSec = timeToSeconds(startTime);
    const endSec = timeToSeconds(endTime);

    const deliveryStart = 8 * 3600;   // 8:00:00 AM in seconds
    const deliveryEnd = 22 * 3600;    // 10:00:00 PM in seconds

    let idleSec = 0;

    // Idle before delivery hours
    if (startSec < deliveryStart) {
        idleSec += Math.min(deliveryStart, endSec) - startSec;
    }

    // Idle after delivery hours
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
// ============================================================
function metQuota(date, activeTime) {
    const activeSec = durationToSeconds(activeTime);

    const dateParts = date.split('-');
    const year = parseInt(dateParts[0]);
    const month = parseInt(dateParts[1]);
    const day = parseInt(dateParts[2]);

    let quotaSec;
    if (year === 2025 && month === 4 && day >= 10 && day <= 30) {
        quotaSec = 6 * 3600; // 6 hours during Eid
    } else {
        quotaSec = 8 * 3600 + 24 * 60; // 8 hours 24 minutes normally
    }

    return activeSec >= quotaSec;
}

// ============================================================
// Function 5: addShiftRecord(textFile, shiftObj)
// textFile: (typeof string) path to shifts text file
// shiftObj: (typeof object) has driverID, driverName, date, startTime, endTime
// Returns: object with 10 properties or empty object {}
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

    // Check for duplicate (same driverID and date)
    for (const line of lines) {
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

    // Insert after last record of this driverID, or append if not found
    let lastIndex = -1;
    for (let i = 0; i < lines.length; i++) {
        const cols = lines[i].split(',');
        if (cols[0].trim() === driverID) {
            lastIndex = i;
        }
    }

    if (lastIndex === -1) {
        lines.push(newLine);
    } else {
        lines.splice(lastIndex + 1, 0, newLine);
    }

    fs.writeFileSync(textFile, lines.join('\n') + '\n', 'utf8');

    return newRecord;
}

// ============================================================
// Function 6: setBonus(textFile, driverID, date, newValue)
// textFile: (typeof string) path to shifts text file
// driverID: (typeof string)
// date: (typeof string) formatted as yyyy-mm-dd
// newValue: (typeof boolean)
// Returns: nothing (void)
// ============================================================
function setBonus(textFile, driverID, date, newValue) {
    const content = fs.readFileSync(textFile, 'utf8');
    const lines = content.split('\n');

    const updatedLines = lines.map(line => {
        if (line.trim() === '') return line;
        const cols = line.split(',');
        if (cols[0].trim() === driverID && cols[2].trim() === date) {
            cols[9] = newValue.toString();
            return cols.join(',');
        }
        return line;
    });

    fs.writeFileSync(textFile, updatedLines.join('\n'), 'utf8');
}

// ============================================================
// Function 7: countBonusPerMonth(textFile, driverID, month)
// textFile: (typeof string) path to shifts text file
// driverID: (typeof string)
// month: (typeof string) formatted as mm or m
// Returns: number (-1 if driverID not found)
// ============================================================
function countBonusPerMonth(textFile, driverID, month) {
    const content = fs.readFileSync(textFile, 'utf8');
    const lines = content.split('\n').filter(line => line.trim() !== '');

    const targetMonth = parseInt(month);
    let driverExists = false;
    let count = 0;

    for (const line of lines) {
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

    if (!driverExists) return -1;
    return count;
}

// ============================================================
// Function 8: getTotalActiveHoursPerMonth(textFile, driverID, month)
// textFile: (typeof string) path to shifts text file
// driverID: (typeof string)
// month: (typeof number)
// Returns: string formatted as hhh:mm:ss
// ============================================================
function getTotalActiveHoursPerMonth(textFile, driverID, month) {
    const content = fs.readFileSync(textFile, 'utf8');
    const lines = content.split('\n').filter(line => line.trim() !== '');

    let totalSec = 0;

    for (const line of lines) {
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
// Function 9: getRequiredHoursPerMonth(textFile, rateFile, bonusCount, driverID, month)
// textFile: (typeof string) path to shifts text file
// rateFile: (typeof string) path to driver rates text file
// bonusCount: (typeof number) total bonuses for given driver per month
// driverID: (typeof string)
// month: (typeof number)
// Returns: string formatted as hhh:mm:ss
// ============================================================
function getRequiredHoursPerMonth(textFile, rateFile, bonusCount, driverID, month) {
    const shiftContent = fs.readFileSync(textFile, 'utf8');
    const shiftLines = shiftContent.split('\n').filter(line => line.trim() !== '');

    const rateContent = fs.readFileSync(rateFile, 'utf8');
    const rateLines = rateContent.split('\n').filter(line => line.trim() !== '');

    // Get driver's day off
    let dayOff = null;
    for (const line of rateLines) {
        const cols = line.split(',');
        if (cols[0].trim() === driverID) {
            dayOff = cols[1].trim().toLowerCase();
            break;
        }
    }

    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

    let totalSec = 0;

    for (const line of shiftLines) {
        const cols = line.split(',');
        if (cols[0].trim() === driverID) {
            const dateStr = cols[2].trim();
            const dateParts = dateStr.split('-');
            const recordMonth = parseInt(dateParts[1]);

            if (recordMonth !== month) continue;

            // Skip if this date falls on driver's day off
            const d = new Date(dateStr);
            const dayName = dayNames[d.getDay()];
            if (dayOff && dayName === dayOff) continue;

            // Determine quota for this specific day
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
    }

    // Subtract 2 hours per bonus
    totalSec -= bonusCount * 2 * 3600;
    if (totalSec < 0) totalSec = 0;

    return secondsToDuration(totalSec);
}

// ============================================================
// Function 10: getNetPay(driverID, actualHours, requiredHours, rateFile)
// driverID: (typeof string)
// actualHours: (typeof string) formatted as hhh:mm:ss
// requiredHours: (typeof string) formatted as hhh:mm:ss
// rateFile: (typeof string) path to driver rates text file
// Returns: integer (net pay)
// ============================================================
function getNetPay(driverID, actualHours, requiredHours, rateFile) {
    const content = fs.readFileSync(rateFile, 'utf8');
    const lines = content.split('\n').filter(line => line.trim() !== '');

    let basePay = 0;
    let tier = 0;

    for (const line of lines) {
        const cols = line.split(',');
        if (cols[0].trim() === driverID) {
            basePay = parseInt(cols[2].trim());
            tier = parseInt(cols[3].trim());
            break;
        }
    }

    const actualSec = durationToSeconds(actualHours);
    const requiredSec = durationToSeconds(requiredHours);

    // No deduction if actual >= required
    if (actualSec >= requiredSec) {
        return basePay;
    }

    const missingSec = requiredSec - actualSec;
    const missingHours = missingSec / 3600;

    const allowedMissing = { 1: 50, 2: 20, 3: 10, 4: 3 };
    const allowed = allowedMissing[tier] || 0;

    const billableMissingHours = missingHours - allowed;

    // No deduction if within allowed missing hours
    if (billableMissingHours <= 0) {
        return basePay;
    }

    // Only full hours count
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
