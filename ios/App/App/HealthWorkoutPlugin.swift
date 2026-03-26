import Foundation
import Capacitor
import HealthKit

@objc(HealthWorkoutPlugin)
public class HealthWorkoutPlugin: CAPPlugin {
    private let healthStore = HKHealthStore()
    private let sessionKey = "liftlog_health_session_start"

    private lazy var isoFormatter: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    private func readObjectTypes() -> Set<HKObjectType> {
        var types = Set<HKObjectType>()
        types.insert(HKObjectType.workoutType())
        let quantityIds: [HKQuantityTypeIdentifier] = [
            .heartRate,
            .restingHeartRate,
            .heartRateVariabilitySDNN,
            .activeEnergyBurned,
            .basalEnergyBurned,
            .stepCount,
            .distanceWalkingRunning,
            .oxygenSaturation,
            .respiratoryRate,
            .bodyMass,
        ]
        for id in quantityIds {
            if let t = HKQuantityType.quantityType(forIdentifier: id) {
                types.insert(t)
            }
        }
        return types
    }

    private func writeSampleTypes() -> Set<HKSampleType> {
        var w = Set<HKSampleType>()
        w.insert(HKObjectType.workoutType())
        return w
    }

    @objc func requestAuthorization(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.reject("HealthKit is niet beschikbaar op dit apparaat.")
            return
        }
        let read = readObjectTypes()
        let write = writeSampleTypes()
        healthStore.requestAuthorization(toShare: write, read: read) { success, error in
            if let error = error {
                call.reject(error.localizedDescription, nil, error)
                return
            }
            call.resolve(["completed": true, "success": success])
        }
    }

    @objc func startSession(_ call: CAPPluginCall) {
        let now = Date()
        UserDefaults.standard.set(now.timeIntervalSince1970, forKey: sessionKey)
        call.resolve([
            "startDate": isoFormatter.string(from: now),
        ])
    }

    @objc func getSession(_ call: CAPPluginCall) {
        guard let ts = UserDefaults.standard.object(forKey: sessionKey) as? TimeInterval else {
            call.resolve(["active": false])
            return
        }
        let start = Date(timeIntervalSince1970: ts)
        call.resolve([
            "active": true,
            "startDate": isoFormatter.string(from: start),
        ])
    }

    @objc func cancelSession(_ call: CAPPluginCall) {
        UserDefaults.standard.removeObject(forKey: sessionKey)
        call.resolve()
    }

    @objc func endSession(_ call: CAPPluginCall) {
        guard let ts = UserDefaults.standard.object(forKey: sessionKey) as? TimeInterval else {
            call.reject("Er is geen actieve Health-sessie. Start eerst een workout.")
            return
        }
        UserDefaults.standard.removeObject(forKey: sessionKey)

        let start = Date(timeIntervalSince1970: ts)
        let end = Date()
        let saveWorkout = call.getBool("saveWorkoutToAppleHealth", false)
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)

        let group = DispatchGroup()
        var payload: [String: Any] = [
            "startDate": isoFormatter.string(from: start),
            "endDate": isoFormatter.string(from: end),
            "durationSeconds": end.timeIntervalSince(start),
        ]

        func runStatistics(
            identifier: HKQuantityTypeIdentifier,
            options: HKStatisticsOptions,
            key: String,
            unit: HKUnit
        ) {
            guard let qType = HKQuantityType.quantityType(forIdentifier: identifier) else {
                return
            }
            group.enter()
            let query = HKStatisticsQuery(
                quantityType: qType,
                quantitySamplePredicate: predicate,
                options: options
            ) { _, statistics, _ in
                defer { group.leave() }
                guard let statistics = statistics else { return }
                if options.contains(.cumulativeSum), let sum = statistics.sumQuantity() {
                    payload[key] = sum.doubleValue(for: unit)
                }
                if options.contains(.discreteAverage), let avg = statistics.averageQuantity() {
                    payload[key] = avg.doubleValue(for: unit)
                }
                if options.contains(.discreteMin), let minQ = statistics.minimumQuantity() {
                    payload[key + "Min"] = minQ.doubleValue(for: unit)
                }
                if options.contains(.discreteMax), let maxQ = statistics.maximumQuantity() {
                    payload[key + "Max"] = maxQ.doubleValue(for: unit)
                }
            }
            healthStore.execute(query)
        }

        // Hartslag: gemiddelde, min, max (o.a. van Apple Watch tijdens training)
        group.enter()
        if let hrType = HKQuantityType.quantityType(forIdentifier: .heartRate) {
            let bpm = HKUnit.count().unitDivided(by: HKUnit.minute())
            let hrQuery = HKStatisticsQuery(
                quantityType: hrType,
                quantitySamplePredicate: predicate,
                options: [.discreteAverage, .discreteMin, .discreteMax]
            ) { _, statistics, _ in
                defer { group.leave() }
                guard let statistics = statistics else { return }
                if let avg = statistics.averageQuantity() {
                    payload["heartRateAvgBpm"] = avg.doubleValue(for: bpm)
                }
                if let minQ = statistics.minimumQuantity() {
                    payload["heartRateMinBpm"] = minQ.doubleValue(for: bpm)
                }
                if let maxQ = statistics.maximumQuantity() {
                    payload["heartRateMaxBpm"] = maxQ.doubleValue(for: bpm)
                }
            }
            healthStore.execute(hrQuery)
        } else {
            group.leave()
        }

        runStatistics(
            identifier: .activeEnergyBurned,
            options: .cumulativeSum,
            key: "activeEnergyKcal",
            unit: HKUnit.kilocalorie()
        )
        runStatistics(
            identifier: .basalEnergyBurned,
            options: .cumulativeSum,
            key: "basalEnergyKcal",
            unit: HKUnit.kilocalorie()
        )
        runStatistics(
            identifier: .stepCount,
            options: .cumulativeSum,
            key: "stepCount",
            unit: HKUnit.count()
        )
        runStatistics(
            identifier: .distanceWalkingRunning,
            options: .cumulativeSum,
            key: "distanceMeters",
            unit: HKUnit.meter()
        )
        runStatistics(
            identifier: .oxygenSaturation,
            options: .discreteAverage,
            key: "oxygenSaturationAvgFraction",
            unit: HKUnit.percent()
        )
        runStatistics(
            identifier: .respiratoryRate,
            options: .discreteAverage,
            key: "respiratoryRateAvg",
            unit: HKUnit.count().unitDivided(by: HKUnit.minute())
        )
        runStatistics(
            identifier: .heartRateVariabilitySDNN,
            options: .discreteAverage,
            key: "hrvSdnnAvgMs",
            unit: HKUnit.secondUnit(with: .milli)
        )

        group.notify(queue: .main) {
            if saveWorkout {
                let energyKcal = payload["activeEnergyKcal"] as? Double
                let energyQuantity: HKQuantity? = {
                    guard let kcal = energyKcal, kcal > 0 else { return nil }
                    return HKQuantity(unit: HKUnit.kilocalorie(), doubleValue: kcal)
                }()
                let workout = HKWorkout(
                    activityType: .traditionalStrengthTraining,
                    start: start,
                    end: end,
                    duration: end.timeIntervalSince(start),
                    totalEnergyBurned: energyQuantity,
                    totalDistance: nil,
                    metadata: [
                        HKMetadataKeyExternalUUID: UUID().uuidString,
                    ]
                )
                self.healthStore.save(workout) { success, error in
                    if let error = error {
                        call.reject(error.localizedDescription, nil, error)
                        return
                    }
                    payload["savedWorkoutToAppleHealth"] = success
                    call.resolve(payload)
                }
            } else {
                call.resolve(payload)
            }
        }
    }
}
