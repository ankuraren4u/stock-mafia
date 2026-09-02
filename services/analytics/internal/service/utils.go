package service

import "math"

func average(nums []float64) float64 {
	if len(nums) == 0 {
		return 0
	}
	sum := 0.0
	for _, n := range nums {
		sum += n
	}
	return sum / float64(len(nums))
}

func stddev(nums []float64) float64 {
	if len(nums) == 0 {
		return 0
	}
	avg := average(nums)
	sum := 0.0
	for _, n := range nums {
		sum += (n - avg) * (n - avg)
	}
	return math.Sqrt(sum / float64(len(nums)))
}
