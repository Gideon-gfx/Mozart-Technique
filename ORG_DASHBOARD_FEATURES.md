# Mozart Techniques - Organization Dashboard Features

## Overview Section
- **Total Students**: Display count of students who have redeemed the organization's access code
- **Active Tutors**: Count of tutors teaching students from this organization
- **Active Lessons**: Count of ongoing lessons
- **Code Status**: Show if the organization's access code is active or inactive
- **Subscription Status Card**: Shows subscription tier (Active/Inactive), monthly amount, and expiration date
- **Payment Options**: Monthly and yearly subscription activation buttons (when inactive)
- **Sponsored Lesson Bills**: Display and pay for lessons sponsored by the organization
- **Recent Activity**: Timeline of recent organization actions

## Students Tab
- **Student List Table**: Shows all students who redeemed the organization's access code
- **Columns**: Name, Email, Active Since (date), Lessons Taken, Status
- **Filter & Search**: (Ready for future enhancement)

## Tutors Tab
- **Tutor Messaging System**: Organization-to-tutor communication interface
- **Tutor List**: Shows all tutors currently teaching organization's students
  - Tutor name, categories taught, student count, profile picture
  - Click to select tutor for messaging
- **Chat Panel**: Real-time conversation interface
  - Message history with tutor
  - Send/receive messages
  - Tutor info and student count display
  - Close conversation option
- **Auto-load conversations** when tutor selected

## Content Tab (Private Organization Media Library)
- **Upload Multiple Content Types**:
  - **Info/Updates**: Text announcements and updates for members
  - **Photos**: Gallery images visible only to organization members
  - **Videos**: Tutorial or training videos for students/tutors
  - **Games/Activities**: Links to interactive learning games or activities
- **Content Upload Form**: Title input, type selection, file upload fields
- **Content Library Display**: Grid/list of all uploaded content
  - Shows content type (icon badge)
  - Title and description
  - Upload date
  - View/open links for media and games
  - Delete button (admin only)
- **Access Control**: Only organization members and tutors can view
- **File Support**: 
  - Photos: up to 8MB (image formats)
  - Videos: up to 500MB (video formats)

## Access Codes Tab
- **Organization Access Code Display**: Single shared code for all organization members
- **Code Generation**: Auto-generated when organization is approved
- **Copy to Clipboard**: Quick copy button for sharing
- **Usage Instructions**: Help text explaining how students use the code
- **Code Status**: Shows if code is active/redeemable

## Settings Tab
- **Organization Information** (Read-only Display):
  - Organization Name
  - Organization Type (NGO / Educational Institution)
  - Contact Email
  - Contact Phone
- **Account Management**: 
  - Edit Profile button (for future profile editing)

## Header Features
- **Back Arrow Navigation**: Go back to previous page
- **Logo & Title**: Quick link to home
- **Location Reload Button**: Country flag/emoji that reloads geolocation data
- **Logout Button**: Sign out of dashboard

## Additional Features
- **Mobile Responsive Design**: Sidebar toggles on mobile, full layout on desktop
- **Alert System**: Toast notifications for actions (success/error/info)
- **Real-time Updates**: Content and messaging refresh on tab switches
- **Session Management**: Auto-checks organization authorization
- **Data Persistence**: All content saved to JSON backend

---

## Feature Status
✅ Overview, Students, Tutors, Codes, Settings - Fully implemented
✅ Organization-to-Tutor Messaging - Fully implemented
✅ Private Content Upload (Photos, Videos, Info, Games) - Fully implemented
✅ Back Arrow Navigation - Fully implemented
⏳ Location Reload Button - Being implemented (this task)
✅ Mobile Responsive - Fully implemented
✅ Alert/Toast Notifications - Fully implemented
