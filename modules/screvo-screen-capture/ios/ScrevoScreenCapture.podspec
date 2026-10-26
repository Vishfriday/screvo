Pod::Spec.new do |s|
  s.name           = 'ScrevoScreenCapture'
  s.version        = '1.0.0'
  s.summary        = 'Screvo capture and audio processing'
  s.description    = 'Noise cancellation on iOS; screen capture remains Android-only pending a Broadcast Upload Extension.'
  s.author         = 'Screvo'
  s.homepage       = 'https://screvo.app'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
