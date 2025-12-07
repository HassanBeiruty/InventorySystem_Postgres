/**
 * Performance monitoring helper for tests
 */

class PerformanceMonitor {
	constructor() {
		this.metrics = [];
		this.thresholds = {
			fast: 200,      // < 200ms is fast
			acceptable: 500, // < 500ms is acceptable
			slow: 1000,     // < 1000ms is slow but ok
			verySlow: 5000  // > 5000ms is very slow
		};
	}

	start(label) {
		return {
			label,
			startTime: Date.now()
		};
	}

	end(timer) {
		const duration = Date.now() - timer.startTime;
		const metric = {
			label: timer.label,
			duration,
			timestamp: new Date().toISOString(),
			status: this.getStatus(duration)
		};
		this.metrics.push(metric);
		return metric;
	}

	getStatus(duration) {
		if (duration < this.thresholds.fast) return 'fast';
		if (duration < this.thresholds.acceptable) return 'acceptable';
		if (duration < this.thresholds.slow) return 'slow';
		if (duration < this.thresholds.verySlow) return 'very-slow';
		return 'timeout';
	}

	getMetrics() {
		return this.metrics;
	}

	getSummary() {
		if (this.metrics.length === 0) {
			return {
				total: 0,
				average: 0,
				min: 0,
				max: 0,
				byStatus: {}
			};
		}

		const durations = this.metrics.map(m => m.duration);
		const total = durations.reduce((sum, d) => sum + d, 0);
		const average = total / durations.length;
		const min = Math.min(...durations);
		const max = Math.max(...durations);

		const byStatus = {};
		this.metrics.forEach(m => {
			byStatus[m.status] = (byStatus[m.status] || 0) + 1;
		});

		return {
			total,
			average: Math.round(average),
			min,
			max,
			byStatus,
			count: this.metrics.length
		};
	}

	printSummary() {
		const summary = this.getSummary();
		console.log('\n' + '='.repeat(60));
		console.log('PERFORMANCE SUMMARY');
		console.log('='.repeat(60));
		console.log(`Total Requests: ${summary.count}`);
		console.log(`Total Time: ${summary.total}ms`);
		console.log(`Average Time: ${summary.average}ms`);
		console.log(`Fastest: ${summary.min}ms`);
		console.log(`Slowest: ${summary.max}ms`);
		console.log('\nBy Status:');
		Object.entries(summary.byStatus).forEach(([status, count]) => {
			console.log(`  ${status}: ${count}`);
		});

		// Show slow requests
		const slowRequests = this.metrics.filter(m => 
			m.duration >= this.thresholds.slow
		);
		if (slowRequests.length > 0) {
			console.log('\n⚠️  Slow Requests (>1000ms):');
			slowRequests.forEach(m => {
				console.log(`  ${m.label}: ${m.duration}ms`);
			});
		}

		// Show timeout requests
		const timeoutRequests = this.metrics.filter(m => 
			m.duration >= this.thresholds.verySlow
		);
		if (timeoutRequests.length > 0) {
			console.log('\n❌ Timeout Requests (>5000ms):');
			timeoutRequests.forEach(m => {
				console.log(`  ${m.label}: ${m.duration}ms`);
			});
		}
		console.log('='.repeat(60) + '\n');
	}

	clear() {
		this.metrics = [];
	}

	assertPerformance(label, duration, maxDuration = 2000) {
		if (duration > maxDuration) {
			throw new Error(
				`Performance assertion failed: ${label} took ${duration}ms, ` +
				`expected < ${maxDuration}ms`
			);
		}
	}
}

module.exports = PerformanceMonitor;

