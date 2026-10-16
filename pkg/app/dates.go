package app

import (
	"time"
	_ "time/tzdata" // Vercel's Go runtime has no zoneinfo
)

var zurich = mustLoad("Europe/Zurich")

func mustLoad(name string) *time.Location {
	loc, err := time.LoadLocation(name)
	if err != nil {
		panic(err)
	}
	return loc
}

// civil is a calendar date at UTC midnight, so subtracting two gives whole days.
func civil(year int, month time.Month, day int) time.Time {
	return time.Date(year, month, day, 0, 0, 0, 0, time.UTC)
}

// today is the current date in Zurich. Tests replace it.
var today = func() time.Time {
	now := time.Now().In(zurich)
	return civil(now.Year(), now.Month(), now.Day())
}

func isLeap(year int) bool { return year%4 == 0 && (year%100 != 0 || year%400 == 0) }

// daysIn is the number of days in a month; year 0 means "any year", so February has 29.
func daysIn(month, year int) int {
	switch month {
	case 2:
		if year == 0 || isLeap(year) {
			return 29
		}
		return 28
	case 4, 6, 9, 11:
		return 30
	default:
		return 31
	}
}

// NextOccurrence is the next date on or after from for an occasion. Yearly dates (year nil) roll over;
// Feb 29 falls on Feb 28 in other years. A one-off date in the past has none (ok false).
func NextOccurrence(month, day int, year *int, from time.Time) (time.Time, bool) {
	if year != nil {
		d := civil(*year, time.Month(month), day)
		return d, !d.Before(from)
	}
	for y := from.Year(); y <= from.Year()+1; y++ {
		dd := day
		if month == 2 && day == 29 && !isLeap(y) {
			dd = 28
		}
		if d := civil(y, time.Month(month), dd); !d.Before(from) {
			return d, true
		}
	}
	return time.Time{}, false // unreachable for valid dates
}

// DaysBetween counts calendar days from a to b.
func DaysBetween(a, b time.Time) int {
	return int(b.Sub(a).Hours() / 24)
}
