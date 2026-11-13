import SwiftUI

/// PHQ-9 self-report check-in. The validated part of the app; expression data is context.
struct CheckInView: View {
    @State private var answers = [Int?](repeating: nil, count: 9)
    @State private var showResult = false

    private var complete: [Int]? {
        answers.allSatisfy { $0 != nil } ? answers.map { $0! } : nil
    }

    var body: some View {
        NavigationStack {
            Form {
                Section { Text(PHQ9.prompt).font(.subheadline) }
                ForEach(PHQ9.items.indices, id: \.self) { i in
                    Section("\(i + 1). \(PHQ9.items[i])") {
                        Picker("Answer", selection: $answers[i]) {
                            Text("—").tag(Int?.none)
                            ForEach(PHQ9.options.indices, id: \.self) { o in
                                Text(PHQ9.options[o]).tag(Int?.some(o))
                            }
                        }
                        .pickerStyle(.menu)
                    }
                    if i == 8, let a = answers[8], a > 0 {
                        Section { CrisisResources(urgent: true) }
                    }
                }
                Section {
                    Button("See result") { showResult = true }.disabled(complete == nil)
                }
            }
            .navigationTitle("Check-in")
            .sheet(isPresented: $showResult) {
                if let a = complete { CheckInResult(answers: a) }
            }
        }
    }
}

struct CheckInResult: View {
    let answers: [Int]
    var body: some View {
        let score = PHQ9.score(answers)
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("PHQ-9: \(score) / 27").font(.largeTitle.bold())
                Text(PHQ9.severity(score) + " symptoms").font(.title3)
                Text(advice(score)).font(.body)
                if PHQ9.needsUrgentSupport(answers) || score >= 10 {
                    CrisisResources(urgent: PHQ9.needsUrgentSupport(answers))
                }
                Text("The PHQ-9 is a screening questionnaire, not a diagnosis. Only a clinician can diagnose depression.")
                    .font(.footnote).foregroundStyle(.secondary)
            }
            .padding(24)
        }
    }

    private func advice(_ s: Int) -> String {
        switch s {
        case ..<5: return "Your answers suggest few symptoms right now."
        case 5..<10: return "Some symptoms. Keep an eye on how you feel; talking to someone you trust can help."
        case 10..<20: return "These answers suggest it would be worth talking to a doctor, nurse or counsellor."
        default: return "Your answers suggest significant symptoms. Please reach out to a doctor or one of the services below soon."
        }
    }
}

/// Crisis and support lines (Finland: Mieli ry crisis helpline; Sweden: Mind Självmordslinjen).
struct CrisisResources: View {
    let urgent: Bool
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(urgent ? "You don't have to handle this alone — talk to someone now." : "Support")
                .font(.headline)
            line("Emergency (EU)", "112")
            line("Finland – Mieli crisis helpline, 24/7", "09 2525 0111")
            line("Sweden – Självmordslinjen (Mind), 24/7", "90101")
            line("Sweden – healthcare advice", "1177")
        }
        .padding(14)
        .background(Color.red.opacity(urgent ? 0.1 : 0.04), in: RoundedRectangle(cornerRadius: 14))
    }

    private func line(_ name: String, _ number: String) -> some View {
        HStack {
            Text(name).font(.subheadline)
            Spacer()
            if let url = URL(string: "tel:" + number.filter(\.isNumber)) {
                Link(number, destination: url).font(.subheadline.weight(.semibold))
            }
        }
    }
}
