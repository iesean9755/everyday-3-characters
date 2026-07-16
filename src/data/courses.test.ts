import {describe,expect,it} from 'vitest';
import {courses} from './courses';

describe('课程数据',()=>{
  it('内置30天和90个汉字条目',()=>{
    expect(courses).toHaveLength(30);
    expect(courses.flatMap(c=>c.characters)).toHaveLength(90);
  });
  it('每节课都有完整目标、语音和三个字',()=>{
    for(const course of courses){
      expect(course.goal.length).toBeGreaterThan(4);
      expect(course.openingSpeech.length).toBeGreaterThan(8);
      expect(course.characters).toHaveLength(3);
      for(const item of course.characters){
        expect(item.char).toHaveLength(1);
        expect(item.speech.length).toBeGreaterThanOrEqual(5);
        expect(item.example.length).toBeGreaterThanOrEqual(4);
      }
    }
  });
});
