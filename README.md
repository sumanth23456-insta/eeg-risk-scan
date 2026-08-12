# EON Predict

Build a Biomedical EEG-Based Early Seizure Risk Assessment Software

Create a modern, professional web application for a Biomedical Engineering research project titled:

“EEG Parameter-Based Early Seizure Risk Assessment Using Pattern Comparison and Machine Learning”

The application should analyze uploaded EEG files, extract clinically/research-relevant EEG parameters, compare the obtained parameters against reference EEG patterns, calculate a seizure-risk score, and display possible outcomes.

1. Main Objective

The software should NOT claim to medically diagnose epilepsy or guarantee that a seizure will occur.

Instead, it should provide a research-oriented seizure risk assessment based on EEG signal characteristics.

The workflow should be:

EEG File Upload → Signal Validation → Preprocessing → Parameter Extraction → Reference Comparison → Risk Calculation → Result Visualization

The application should classify the analyzed EEG segment into:

Normal / Interictal Pattern

Possible Preictal Pattern

Possible Ictal Pattern

Uncertain / Insufficient Data

Use appropriate wording such as “possible preictal pattern” and “estimated seizure risk” rather than definitive medical diagnosis.

2. Application Pages

Create the following pages:

Dashboard

Display:

Application name

Short description

Upload EEG button

Recent analysis history

Current analysis status

Last calculated risk score

Quick statistics

Dashboard cards:

EEG Files Analyzed

Normal Patterns

Possible Preictal Patterns

Possible Ictal Patterns

Average Risk Score

3. EEG Upload Page

Create an EEG upload interface.

Allow the user to upload common EEG data formats where practical, such as:

CSV

TXT

EDF

For CSV/TXT files, allow the user to specify:

Sampling frequency

Number of channels

Channel names

Time duration

For EDF files, attempt to read available metadata automatically.

Display:

File name

File size

Sampling frequency

Number of channels

Recording duration

Channel names

Data quality status

Include a “Start EEG Analysis” button.

4. EEG Signal Visualization

After uploading the file, display the raw EEG signal.

Create an interactive EEG viewer with:

Time on X-axis

Amplitude on Y-axis

Channel selection

Zoom

Pan

Time-window selection

Play/pause if possible

Allow the user to select a specific EEG segment for analysis.

Example:

Selected analysis window: 30 seconds

5. EEG Preprocessing

Implement a preprocessing pipeline conceptually consisting of:

Remove invalid/missing values

Baseline correction

Band-pass filtering

Optional notch filtering for power-line interference

Artifact detection

Signal normalization

Provide a toggle:

Show Raw Signal / Show Preprocessed Signal

Display a small explanation of what preprocessing does.

Do not silently modify the original uploaded file.

6. EEG Parameter Extraction

Extract meaningful EEG parameters from the selected EEG segment.

Calculate at least:

Time-domain parameters

Mean amplitude

RMS amplitude

Variance

Standard deviation

Signal energy

Peak amplitude

Peak-to-peak amplitude

Frequency-domain parameters

Calculate power in:

Delta: 0.5–4 Hz

Theta: 4–8 Hz

Alpha: 8–13 Hz

Beta: 13–30 Hz

Gamma: 30–100 Hz where the sampling rate supports it

Also calculate:

Relative band power

Dominant frequency

Spectral power

Power ratios

Nonlinear / complexity parameters

Calculate where technically feasible:

Spectral entropy

Sample entropy

Signal complexity

Wavelet features

Use a discrete wavelet transform or another appropriate wavelet method to calculate wavelet coefficients and their energy.

EEG abnormality-related features

Where feasible, calculate features related to:

Sharp waves

Spikes

High-amplitude bursts

Sudden frequency changes

Sudden energy changes

Do NOT label every spike as a seizure. Treat these only as features contributing to the overall assessment.

7. Parameter Dashboard

Create a professional parameter-analysis dashboard.

Show the extracted values in cards/table format.

Example:

ParameterObtained ValueReference PatternDifferenceStatusRMS AmplitudeDelta PowerTheta PowerAlpha PowerBeta PowerSpectral EntropySignal Energy

Use visual indicators for whether the obtained parameter is within, above, or below the reference range.

8. Reference Pattern Database

Create a reference-pattern system.

The system should contain reference characteristics for:

Normal / Interictal

EEG patterns between seizures.

Preictal

Patterns associated with the period before seizure onset.

Ictal

Patterns occurring during a seizure.

IMPORTANT:

Do not hard-code arbitrary medical thresholds and present them as clinically established values.

Instead, design the system so reference ranges can be generated from a labeled EEG dataset.

For example:

Reference Dataset → Feature Extraction → Statistical Distribution → Reference Range

Store:

Mean

Standard deviation

Median

Interquartile range

Minimum

Maximum

for each feature and class.

9. Pattern Comparison Engine

Create a comparison engine that compares the new EEG segment with the reference patterns.

Calculate normalized differences between the obtained parameters and reference distributions.

Use a suitable statistical or machine-learning method such as:

Z-score based comparison

Distance-based comparison

Random Forest

Support Vector Machine

Logistic Regression

Gradient Boosting

The architecture should allow a trained ML model to replace the initial rule/statistical model later.

The system should generate a similarity score for:

Normal / Interictal

Preictal

Ictal

Example:

Pattern Similarity

Normal: 32%

Preictal: 78%

Ictal: 41%

These values should be calculated from the actual extracted features and trained/reference data, not randomly generated.

10. Seizure Risk Score

Create a clearly visible risk assessment card.

Example:

Estimated Seizure Risk

78%

Status:

Possible Preictal Pattern

Use a continuous 0–100 risk score.

However, clearly state that this is an algorithmic research score, not a clinically validated probability.

The risk score should be based on the model output and/or validated statistical comparison.

11. Early Warning System

If the software identifies a pattern that resembles the preictal reference pattern, display:

⚠ Possible Early-Warning Pattern Detected

Show:

Current EEG window

Risk score

Most influential parameters

Comparison with reference patterns

Model confidence

Time window analyzed

Do NOT say:

“Seizure will definitely occur.”

Instead say:

“The analyzed EEG segment shows characteristics similar to the preictal reference pattern. This result requires clinical validation and should not be interpreted as a diagnosis.”

12. EEG Charts

Create interactive charts for:

EEG waveform

Raw and processed EEG.

Frequency spectrum

Show frequency vs power.

Band-power chart

Display:

Delta

Theta

Alpha

Beta

Gamma

Spectrogram

Display how frequency content changes over time.

Risk timeline

Show seizure-risk score over consecutive EEG windows.

Example:

Time →
0% ────────────────────────────────
        25%     42%    63%    81%
                         ↑
                  Possible
                preictal pattern


13. Explainable AI Section

Create an “Why did the model give this result?” section.

Display the most influential parameters.

Example:

Main contributing features

Increased high-frequency power

Increased signal energy

Change in spectral entropy

Abnormal wavelet energy distribution

Increased amplitude variability

Show the contribution of each feature using a bar chart.

Do not claim that these features independently prove seizure occurrence.

14. Result Page

Create a professional result page containing:

Analysis Summary

File analyzed

EEG channels

Sampling frequency

Analysis window

Parameters extracted

Model used

Result

Classification: Possible Preictal Pattern

Estimated Risk Score: 78/100

Model Confidence: 84%

Supporting Evidence

Display the parameters that contributed most strongly to the result.

Visualizations

Include:

EEG waveform

Spectrogram

Frequency spectrum

Band power

Risk timeline

15. Report Generation

Add a button:

Generate Analysis Report

Generate a downloadable PDF report containing:

Patient/recording ID if provided

Recording information

EEG preprocessing information

Extracted parameters

Reference comparison

Risk score

Classification

Graphs

Model information

Limitations

Disclaimer

Do not automatically include personally identifiable information unless explicitly entered by the user.

16. Analysis History

Create an analysis-history page.

For every analysis store:

Analysis ID

File name

Date/time

Classification

Risk score

Model confidence

Number of channels

Recording duration

Allow the user to open previous analysis results.

17. Dataset / Model Training Page

Create an optional research section called:

Model Training

Allow researchers to upload labeled EEG datasets.

Dataset classes:

Interictal

Preictal

Ictal

Show:

Number of samples

Number of patients/subjects

Class distribution

Training/test split

Feature count

Provide model options:

Logistic Regression

SVM

Random Forest

XGBoost/Gradient Boosting

CNN

LSTM

Display:

Accuracy

Precision

Recall/Sensitivity

Specificity

F1-score

ROC-AUC

Confusion matrix

IMPORTANT:

For medical seizure prediction, avoid random train/test splitting across segments from the same patient because this can cause data leakage. Prefer patient-wise separation when the dataset permits it.

18. Modern UI Design

Use a clean medical-research interface.

Design requirements:

Professional biomedical dashboard

White/light background

Blue/teal medical-style accent colors

Clear typography

Responsive design

Cards with subtle borders

Interactive charts

Minimal unnecessary animations

Dark mode option

Main navigation:

Dashboard | Upload EEG | Analysis | Parameters | Prediction | History | Model Training | Reports

19. Technology

Use:

React

TypeScript

Tailwind CSS

Recharts or another suitable charting library

For computational EEG processing and machine learning, create a backend architecture that can support Python services using:

NumPy

SciPy

Pandas

MNE-Python

Scikit-learn

PyWavelets

PyTorch/TensorFlow if deep learning is added

If direct Python execution is not available in the initial Lovable environment, create clean API endpoints/interfaces so that a Python EEG-processing backend can be connected later.

Do not fake EEG calculations.

If a function is not yet implemented, clearly label it as:

“Processing module not connected.”

Do not generate fake medical predictions.

20. Important Medical Safety Notice

Display the following notice in the application:

Research Use Only

“This software is a research and educational prototype for EEG signal analysis and seizure-risk assessment. It is not a medical diagnostic device and must not be used to diagnose epilepsy, predict an individual seizure with certainty, or replace evaluation by a qualified healthcare professional.”

21. Initial Demo Mode

For demonstration purposes, include a sample EEG dataset.

The demo should allow the user to click:

“Load Sample EEG”

and see the complete analysis workflow.

The demo data must be clearly labeled as:

Synthetic/Demo Data

Do not represent synthetic data as real patient data.

22. Final Goal

The completed application should demonstrate the following complete pipeline:

Actual EEG File

↓

Signal Preprocessing

↓

EEG Parameter Extraction

↓

Comparison With Reference EEG Patterns

↓

Machine Learning / Statistical Analysis

↓

Risk Score

↓

Possible Pattern Classification

↓

Explainable Result

↓

Visual Dashboard + PDF Report

Build the application with a modular architecture so that the EEG processing algorithm, reference dataset, and machine-learning model can be improved later without redesigning the user interface.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/3ea22243-ebb9-4f34-9c20-94333d53775f).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
